import express from 'express';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import path from 'path';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// n8n webhook URL for webcam photo processing
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL!;

// Baserow configuration
const BASEROW_TABLE_API = process.env.BASEROW_TABLE_API!;
const BASEROW_TOKEN = process.env.BASEROW_TOKEN!;
const ACTIVITY_TABLE_ID = process.env.ACTIVITY_TABLE_ID!;
const ACTIVITY_ROW_ID = process.env.ACTIVITY_ROW_ID!;
const ACTIVITY_API = `https://dev-n8n-baserow.fxwebapps.com/api/database/rows/table/${ACTIVITY_TABLE_ID}/${ACTIVITY_ROW_ID}/?user_field_names=true`;
const VIDEO_FIELD = process.env.VIDEO_FIELD!;

// Email configuration
const EMAIL_HOST = process.env.EMAIL_HOST!;
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT!) || 587;
const EMAIL_USER = process.env.EMAIL_USER!;
const EMAIL_PASS = process.env.EMAIL_PASS!;
const EMAIL_FROM = process.env.EMAIL_FROM!;

// Create email transporter
const emailTransporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// Store current activity status
let currentActivity: string = 'Finish';

// Configure multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Middleware
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

// Helper function to update activity status in Baserow
async function updateActivity(activity: string) {
  try {
    const response = await axios.patch(ACTIVITY_API, {
      Activity: activity
    }, {
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log(`Activity updated to: ${activity}`);
    currentActivity = activity;
    return response.data;
  } catch (error: any) {
    console.error('Error updating activity:', error.message);
    throw error;
  }
}

// Function to fetch activity status
async function fetchActivityStatus() {
  try {
    const response = await axios.get(ACTIVITY_API, {
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.data && response.data.Activity) {
      const newActivity = response.data.Activity;
      if (newActivity !== currentActivity) {
        console.log(`Activity changed: ${currentActivity} -> ${newActivity}`);
        currentActivity = newActivity;
      }
    }
  } catch (error: any) {
    console.error('Error fetching activity status:', error.message);
  }
}

// Start polling activity status every 2 seconds
setInterval(fetchActivityStatus, 2000);
fetchActivityStatus(); // Initial fetch

// Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Get activity status endpoint
app.get('/get_activity', (req, res) => {
  res.json({ Activity: currentActivity });
});

// Update activity status endpoint (for Starting and Processing from frontend)
app.post('/update_activity', async (req, res) => {
  const { activity } = req.body;
  
  if (!activity) {
    return res.status(400).json({ error: 'Activity is required' });
  }
  
  // Only allow Starting and Processing from frontend
  if (activity !== 'Starting' && activity !== 'Processing') {
    return res.status(400).json({ error: 'Only Starting and Processing activities allowed from frontend' });
  }
  
  try {
    await updateActivity(activity);
    res.json({ success: true, activity: currentActivity });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update activity' });
  }
});

// Upload webcam photo endpoint
app.post('/upload-photo', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('Received webcam photo:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // Update activity to Processing before sending to n8n
    await updateActivity('Processing');

    // Create FormData for n8n webhook
    const formData = new FormData();
    formData.append('image', req.file.buffer, {
      filename: req.file.originalname || 'webcam-photo.jpg',
      contentType: req.file.mimetype || 'image/jpeg'
    });

    // Send to n8n webhook
    console.log('Sending to n8n webhook:', N8N_WEBHOOK_URL);
    console.log('FormData headers:', formData.getHeaders());
    
    const response = await axios.post(N8N_WEBHOOK_URL, formData, {
      headers: {
        ...formData.getHeaders()
      },
      timeout: 30000 // 30 second timeout
    });

    console.log('n8n response:', response.status, response.statusText);
    console.log('Photo uploaded to n8n workflow successfully');

    res.json({
      success: true,
      message: 'Photo uploaded successfully to n8n workflow',
      n8nResponse: {
        status: response.status,
        data: response.data
      }
    });

  } catch (error: any) {
    console.error('Error uploading to n8n:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText
    });
    
    // Reset activity status to Finish if upload fails
    try {
      await updateActivity('Finish');
    } catch (updateError) {
      console.error('Failed to reset activity status:', updateError);
    }
    
    if (axios.isAxiosError(error)) {
      res.status(500).json({
        error: 'Failed to send photo to n8n workflow',
        details: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  }
});

// Get latest video endpoint
app.get('/get_video', async (req, res) => {
  console.log('[GET /get_video] Request received');
  
  try {
    const response = await axios.get(BASEROW_TABLE_API, {
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`
      }
    });
    
    const data = response.data;
    const rows = data.results || [];
    
    if (!rows.length) {
      return res.status(404).json({ error: 'No videos found.' });
    }
    
    // Get the latest row (highest ID)
    const latestRow = rows.reduce((a: any, b: any) => (a.id > b.id ? a : b));
    const video_url = latestRow[VIDEO_FIELD];
    const title = latestRow['Title'] || '';
    const description = latestRow['Description'] || '';
    const status = latestRow['Status'] || 'ready';
    const video_id = latestRow['Video ID'] || latestRow['id'];
    
    console.log('Latest video:', { id: video_id, status, hasUrl: !!video_url });
    
    res.json({ 
      video_url: video_url || '', 
      title, 
      description, 
      status, 
      video_id 
    });
  } catch (error: any) {
    console.error('Error fetching video:', error);
    res.status(500).json({ error: error.toString() });
  }
});

// Send email endpoint
app.post('/send-email', async (req, res) => {
  try {
    console.log('Email request received:', req.body);
    const { email, videoUrl, title, description } = req.body;
    
    if (!email || !videoUrl) {
      return res.status(400).json({ error: 'Email and video URL are required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    console.log('Email configuration:', {
      host: EMAIL_HOST,
      port: EMAIL_PORT,
      user: EMAIL_USER,
      from: EMAIL_FROM
    });
    
    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: '🎉 Your AI Cartoon Video is Ready!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4CAF50; margin-bottom: 10px;">🎉 Your Video is Ready!</h1>
            <p style="color: #666; font-size: 16px;">Your AI-generated cartoon video has been processed successfully.</p>
          </div>
          
          <div style="background: #f9f9f9; padding: 20px; border-radius: 10px; margin-bottom: 30px;">
            ${title ? `<h2 style="color: #333; margin-top: 0;">${title}</h2>` : ''}
            ${description ? `<p style="color: #666; margin-bottom: 20px;">${description}</p>` : ''}
            
            <div style="text-align: center;">
              <a href="${videoUrl}" 
                 style="display: inline-block; background: #4CAF50; color: white; padding: 15px 30px; 
                        text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                📺 Watch Your Video
              </a>
            </div>
          </div>
          
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <p style="margin: 0; color: #856404;">
              <strong>💡 Tip:</strong> You can also download the video by right-clicking the link above and selecting "Save link as..."
            </p>
          </div>
          
          <div style="text-align: center; color: #999; font-size: 14px;">
            <p>Direct link: <a href="${videoUrl}" style="color: #4CAF50;">${videoUrl}</a></p>
            <p>Generated by AI Cartoon Video Generator</p>
          </div>
        </div>
      `
    };
    
    console.log('Attempting to send email...');
    await emailTransporter.sendMail(mailOptions);
    
    console.log(`Email sent successfully to: ${email}`);
    res.json({ 
      success: true, 
      message: 'Email sent successfully!' 
    });
    
  } catch (error: any) {
    console.error('Error sending email:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode
    });
    res.status(500).json({ 
      error: 'Failed to send email', 
      details: error.message,
      code: error.code
    });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📸 Webcam photo capture ready`);
  console.log(`🔗 n8n webhook: ${N8N_WEBHOOK_URL}`);
  console.log(`📊 Baserow polling: ${BASEROW_TABLE_API}`);
  console.log(`⚡ Activity status polling: ${ACTIVITY_API}`);
  console.log(`🔄 Activity status will be polled every 2 seconds`);
});
