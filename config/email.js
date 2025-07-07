const nodemailer = require('nodemailer');

const EMAIL_CONFIG = {
  // SMTP Configuration - Update these with your email provider settings
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || '', // Your email address
    pass: process.env.SMTP_PASS || '', // Your email password or app password
  },
  
  // Default sender info
  defaultFrom: process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@yourbusiness.com',
  defaultFromName: process.env.EMAIL_FROM_NAME || 'Your Business Name',
};

// Create email transporter
const createTransporter = () => {
  if (!EMAIL_CONFIG.auth.user || !EMAIL_CONFIG.auth.pass) {
    console.warn('⚠️ Email configuration incomplete. Check SMTP_USER and SMTP_PASS environment variables.');
    return null;
  }

  return nodemailer.createTransporter({
    host: EMAIL_CONFIG.host,
    port: EMAIL_CONFIG.port,
    secure: EMAIL_CONFIG.secure,
    auth: EMAIL_CONFIG.auth,
  });
};

module.exports = {
  EMAIL_CONFIG,
  createTransporter
}; 