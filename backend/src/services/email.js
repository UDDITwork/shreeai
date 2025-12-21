import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter = null;

function initializeEmailService() {
  if (transporter) {
    return transporter;
  }

  if (process.env.EMAIL_SERVICE === 'sendgrid') {
    // SendGrid configuration
    transporter = nodemailer.createTransport({
      service: 'SendGrid',
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  } else {
    // SMTP configuration
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  return transporter;
}

export async function sendReminderEmail(userId, reminder) {
  try {
    const transporter = initializeEmailService();
    
    // Get user email
    const { client } = await import('../models/database.js');
    const userResult = await client.execute({
      sql: 'SELECT email FROM users WHERE id = ?',
      args: [userId]
    });

    if (userResult.rows.length === 0) {
      return { success: false, error: 'User not found' };
    }

    const userEmail = userResult.rows[0].email;

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: userEmail,
      subject: 'Reminder: Task Due',
      html: `
        <h2>Reminder</h2>
        <p>You have a reminder scheduled for ${new Date(reminder.scheduled_time).toLocaleString()}</p>
        <p>Please check your Smart Idea Manager app for details.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Send email error:', error);
    return { success: false, error: error.message };
  }
}

export async function sendEmail(to, subject, html) {
  try {
    const transporter = initializeEmailService();
    
    const mailOptions = {
      from: process.env.SMTP_USER,
      to,
      subject,
      html,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Send email error:', error);
    return { success: false, error: error.message };
  }
}

