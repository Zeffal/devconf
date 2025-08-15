class WebcamCapture {
    constructor() {
        // DOM elements
        this.step1 = document.getElementById('step1');
        this.step2 = document.getElementById('step2');
        this.step3 = document.getElementById('step3');
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.resultVideo = document.getElementById('resultVideo');
        
        // Control buttons
        this.startCameraBtn = document.getElementById('startCamera');
        this.capturePhotoBtn = document.getElementById('capturePhoto');
        this.stopCameraBtn = document.getElementById('stopCamera');
        this.makeNewBtn = document.getElementById('makeNewBtn');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.emailBtn = document.getElementById('emailBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.shareBtn = document.getElementById('shareBtn');
        
        // Modals
        this.emailModal = document.getElementById('emailModal');
        this.qrModal = document.getElementById('qrModal');
        this.closeEmailModal = document.getElementById('closeEmailModal');
        this.closeQrModal = document.getElementById('closeQrModal');
        this.emailForm = document.getElementById('emailForm');
        this.emailInput = document.getElementById('emailInput');
        
        // State variables
        this.stream = null;
        this.capturedBlob = null;
        this.currentActivity = 'Finish';
        this.currentVideoUrl = null;
        this.isFullscreen = false;
        this.pollIntervalId = null;
        
        this.initEventListeners();
        this.startBackgroundPolling();
        this.determineInitialPage();
    }
    
    initEventListeners() {
        // Camera controls
        this.startCameraBtn?.addEventListener('click', () => this.startCamera());
        this.capturePhotoBtn?.addEventListener('click', () => this.capturePhoto());
        this.stopCameraBtn?.addEventListener('click', () => this.stopCamera());
        this.makeNewBtn?.addEventListener('click', () => this.makeNew());
        
        // Video controls
        this.fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());
        this.emailBtn?.addEventListener('click', () => this.showEmailModal());
        this.downloadBtn?.addEventListener('click', () => this.showQrModal());
        this.shareBtn?.addEventListener('click', () => this.copyVideoLink());
        
        // Modal controls
        this.closeEmailModal?.addEventListener('click', () => this.hideEmailModal());
        this.closeQrModal?.addEventListener('click', () => this.hideQrModal());
        this.emailForm?.addEventListener('submit', (e) => this.sendEmail(e));
        
        // ESC key handling
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.isFullscreen) {
                    this.exitFullscreen();
                } else if (this.emailModal?.style.display === 'block') {
                    this.hideEmailModal();
                } else if (this.qrModal?.style.display === 'block') {
                    this.hideQrModal();
                }
            }
        });
        
        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === this.emailModal) this.hideEmailModal();
            if (e.target === this.qrModal) this.hideQrModal();
        });
    }
    
    async startCamera() {
        try {
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: false
            };
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            this.video.style.display = 'block';
            this.video.play();
            
            // Update button states
            this.startCameraBtn.disabled = true;
            this.capturePhotoBtn.disabled = false;
            this.stopCameraBtn.disabled = false;
            
            console.log('Camera started successfully');
        } catch (error) {
            console.error('Error starting camera:', error);
            alert('Failed to start camera. Please check permissions.');
        }
    }
    
    capturePhoto() {
        if (!this.stream) {
            alert('Please start the camera first');
            return;
        }
        
        try {
            // Set canvas dimensions to match video
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            
            // Draw video frame to canvas
            const ctx = this.canvas.getContext('2d');
            ctx.drawImage(this.video, 0, 0);
            
            // Convert canvas to blob
            this.canvas.toBlob(async (blob) => {
                this.capturedBlob = blob;
                
                // Stop camera after capturing
                this.stopCamera();
                
                // Automatically upload photo
                await this.uploadPhoto();
            }, 'image/jpeg', 0.9);
            
        } catch (error) {
            console.error('Error capturing photo:', error);
            alert('Failed to capture photo');
        }
    }
    
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.video.srcObject = null;
            this.video.style.display = 'none';
            
            // Update button states
            this.startCameraBtn.disabled = false;
            this.capturePhotoBtn.disabled = true;
            this.stopCameraBtn.disabled = true;
            
            console.log('Camera stopped');
        }
    }
    
    async uploadPhoto() {
        if (!this.capturedBlob) {
            alert('No photo to upload');
            return;
        }
        
        try {
            const formData = new FormData();
            formData.append('image', this.capturedBlob, 'webcam-photo.jpg');
            
            const response = await fetch('/upload-photo', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                console.log('Photo uploaded successfully:', result);
            } else {
                throw new Error(result.error || 'Upload failed');
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            alert(`Upload failed: ${error.message}`);
        }
    }
    
    async makeNew() {
        try {
            // Update activity to Starting
            const response = await fetch('/update_activity', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ activity: 'Starting' })
            });
            
            if (response.ok) {
                console.log('Activity updated to Starting');
                // Reset state
                this.capturedBlob = null;
                this.currentVideoUrl = null;
                // Start camera automatically
                this.startCamera();
            } else {
                throw new Error('Failed to update activity');
            }
        } catch (error) {
            console.error('Error in makeNew:', error);
            alert('Failed to start new session');
        }
    }
    
    // Background polling for activity and video updates
    startBackgroundPolling() {
        if (this.pollIntervalId) {
            clearInterval(this.pollIntervalId);
        }
        
        // Poll every 2 seconds
        this.pollIntervalId = setInterval(async () => {
            await this.pollForActivity();
            await this.pollForVideo();
            this.determinePageToShow();
        }, 2000);
        
        // Initial poll
        this.pollForActivity();
        this.pollForVideo();
    }
    
    async pollForActivity() {
        try {
            const response = await fetch('/get_activity');
            const result = await response.json();
            
            if (result.Activity && result.Activity !== this.currentActivity) {
                console.log(`Activity changed: ${this.currentActivity} -> ${result.Activity}`);
                this.currentActivity = result.Activity;
            }
        } catch (error) {
            console.error('Error polling activity:', error);
        }
    }
    
    async pollForVideo() {
        try {
            // Only fetch video when activity is Finish
            if (this.currentActivity === 'Finish') {
                const response = await fetch('/get_video');
                if (response.ok) {
                    const data = await response.json();
                    const videoUrl = data.video_url;
                    const title = data.title || '';
                    const description = data.description || '';
                    const status = (data.status || '').toLowerCase();
                    
                    // Update video if we have a completed video
                    if (videoUrl && status === 'completed' && videoUrl !== this.currentVideoUrl) {
                        this.updateVideoDisplay(videoUrl, title, description);
                        this.currentVideoUrl = videoUrl;
                        console.log('Video updated:', { videoUrl, title, description });
                    }
                }
            }
        } catch (error) {
            console.error('Error polling video:', error);
        }
    }
    
    updateVideoDisplay(videoUrl, title = '', description = '') {
        if (!this.resultVideo) return;
        
        this.resultVideo.src = videoUrl;
        this.resultVideo.load();
        this.currentVideoUrl = videoUrl;
        
        console.log('Video display updated:', { videoUrl, title, description });
    }
    
    determineInitialPage() {
        setTimeout(() => {
            this.determinePageToShow();
        }, 500);
    }
    
    determinePageToShow() {
        console.log('Determining page to show:', {
            activity: this.currentActivity,
            hasVideo: !!this.currentVideoUrl
        });
        
        // Show pages based on activity status
        if (this.currentActivity === 'Starting') {
            this.showStep(1); // Show capture photo page
        } else if (this.currentActivity === 'Processing') {
            this.showStep(2); // Show loading page
        } else if (this.currentActivity === 'Finish') {
            this.showStep(3); // Show completed video page
        } else {
            this.showStep(2); // Default to loading
        }
    }
    
    showStep(stepNumber) {
        // Hide all steps
        this.step1.style.display = 'none';
        this.step2.style.display = 'none';
        this.step3.style.display = 'none';
        
        // Show target step
        if (stepNumber === 1) {
            this.step1.style.display = 'block';
        } else if (stepNumber === 2) {
            this.step2.style.display = 'block';
        } else if (stepNumber === 3) {
            this.step3.style.display = 'block';
        }
        
        console.log('Showing step:', stepNumber);
    }
    
    // Fullscreen functionality
    toggleFullscreen() {
        if (this.isFullscreen) {
            this.exitFullscreen();
        } else {
            this.enterFullscreen();
        }
    }
    
    enterFullscreen() {
        this.isFullscreen = true;
        this.resultVideo.parentElement.classList.add('fullscreen');
        this.fullscreenBtn.textContent = '❌';
        this.fullscreenBtn.title = 'Exit Fullscreen';
        
        if (this.resultVideo.parentElement.requestFullscreen) {
            this.resultVideo.parentElement.requestFullscreen().catch(err => {
                console.log('Fullscreen API not supported');
            });
        }
    }
    
    exitFullscreen() {
        this.isFullscreen = false;
        this.resultVideo.parentElement.classList.remove('fullscreen');
        this.fullscreenBtn.textContent = '📺';
        this.fullscreenBtn.title = 'View Fullscreen';
        
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(err => {
                console.log('Error exiting fullscreen:', err);
            });
        }
    }
    
    // Modal functions
    showEmailModal() {
        this.emailModal.style.display = 'block';
        this.emailInput.focus();
    }
    
    hideEmailModal() {
        this.emailModal.style.display = 'none';
        this.emailInput.value = '';
    }
    
    showQrModal() {
        this.qrModal.style.display = 'block';
        this.generateQRCode();
    }
    
    hideQrModal() {
        this.qrModal.style.display = 'none';
    }
    
    async sendEmail(e) {
        e.preventDefault();
        const email = this.emailInput.value;
        
        if (!email) {
            alert('Please enter an email address');
            return;
        }
        
        if (!this.currentVideoUrl) {
            alert('No video available to send');
            return;
        }
        
        try {
            const response = await fetch('/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email,
                    videoUrl: this.currentVideoUrl,
                    title: 'Your AI Cartoon Video',
                    description: 'Your personalized cartoon video is ready to watch!'
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                alert('Email sent successfully! Check your inbox.');
                this.hideEmailModal();
            } else {
                throw new Error(result.error || 'Failed to send email');
            }
            
        } catch (error) {
            console.error('Email error:', error);
            alert(`Failed to send email: ${error.message}`);
        }
    }
    
    generateQRCode() {
        const container = document.getElementById('qrCodeContainer');
        if (this.currentVideoUrl) {
            container.innerHTML = '';
            
            // Create QR code using QR Server API
            const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(this.currentVideoUrl)}`;
            
            const qrImage = document.createElement('img');
            qrImage.src = qrCodeUrl;
            qrImage.alt = 'QR Code for video download';
            qrImage.style.width = '200px';
            qrImage.style.height = '200px';
            qrImage.style.border = '1px solid #ddd';
            qrImage.style.borderRadius = '8px';
            
            container.appendChild(qrImage);
            
            // Add download link
            const linkElement = document.createElement('p');
            linkElement.innerHTML = `<small>Or <a href="${this.currentVideoUrl}" target="_blank" download>click here to download</a></small>`;
            linkElement.style.marginTop = '10px';
            linkElement.style.fontSize = '12px';
            container.appendChild(linkElement);
        } else {
            container.innerHTML = '<p>No video URL available</p>';
        }
    }
    
    async copyVideoLink() {
        if (this.currentVideoUrl) {
            try {
                await navigator.clipboard.writeText(this.currentVideoUrl);
                alert('Video link copied to clipboard!');
            } catch (error) {
                alert('Failed to copy link');
            }
        } else {
            alert('No video URL available');
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing WebcamCapture...');
    
    try {
        const webcamCapture = new WebcamCapture();
        window.webcamCapture = webcamCapture; // Make globally accessible
        console.log('WebcamCapture initialized successfully');
    } catch (error) {
        console.error('Error initializing WebcamCapture:', error);
    }
    
    // Check if browser supports getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('Browser does not support getUserMedia');
        alert('Your browser does not support webcam access. Please use a modern browser.');
    }
});