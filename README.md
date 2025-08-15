# Webcam Photo Capture - n8n Integration

A TypeScript-based web application that captures photos from your webcam and sends them to an n8n workflow via webhook.

## Features

- 📸 **Webcam Integration**: Access and control your webcam directly from the browser
- 🎯 **Photo Capture**: Take high-quality photos with a single click
- 🔄 **n8n Workflow Integration**: Automatically send captured photos to your n8n webhook
- 💻 **Modern UI**: Clean, responsive design that works on desktop and mobile
- ⚡ **TypeScript Server**: Robust backend with proper error handling
- 🚀 **Auto-Install**: Dependencies are automatically installed when you run `npm start`

## Quick Start

1. **Start the application**:
   ```bash
   npm start
   ```
   This command will:
   - Install all dependencies (`npm install`)
   - Build the TypeScript code (`npm run build`)
   - Start the server on `http://localhost:3000`

2. **Open your browser** and navigate to `http://localhost:3000`

3. **Use the application**:
   - Click "Start Camera" to access your webcam
   - Click "Capture Photo" to take a picture
   - Click "Send to n8n Workflow" to upload the photo

## n8n Webhook Configuration

The application is configured to send photos to:
```
https://dev-n8n.fxwebapps.com/webhook/43e92450-5afc-428a-abaa-4cc67de36e2a
```

The photo data is sent with the field name `"image"` as specified in your requirements.

## Development

- **Development mode**: `npm run dev` (uses ts-node for hot reloading)
- **Build only**: `npm run build`
- **Production**: `npm start`

## Technical Details

- **Backend**: Express.js with TypeScript
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **File Upload**: Multer for handling multipart/form-data
- **HTTP Client**: Axios for n8n webhook requests
- **Webcam API**: MediaDevices.getUserMedia()

## Browser Compatibility

Requires a modern browser with webcam support:
- Chrome 53+
- Firefox 36+
- Safari 11+
- Edge 12+

## Security Features

- File size limit: 10MB
- Memory-based file storage (no files saved to disk)
- HTTPS support for webcam access
- Proper error handling and user feedback
