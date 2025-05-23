const nodemailer = require("nodemailer");

async function sendEmail(email, otp) {
    const transporter = nodemailer.createTransport({
        host: "mail.natt.world",
        port: 465,
        auth: {
            user: process.env.NODEMAIL_USER,
            pass: process.env.NODEMAIL_PASSWORD,
        },
    });

    const mailOptions = {
        from: `"UBTS · NATT" <${process.env.NODEMAIL_USER}>`,
        to: email,
        subject: "Reset your Password with NATT",
        html: `
        <div style="font-family: Arial, sans-serif;">
            <table style="width: 100%; background-color: #f9f9f9; padding: 20px;">
                <tr>
                    <td>
                        <table align="center" style="width: 100%; max-width: 600px; background-color: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
                            <tr>
                                <td style="text-align: center;">
                                    <img src="https://lunchadmin.ubts.com.sg/storage/app/public/email_template/2024-04-03-660d0a12e2988.png" alt="UBTS Logo" style="width: 250px; height: auto; object-fit: contain;">
                                </td>
                            </tr>
                            <tr>
                                <td style="text-align: center; padding-top: 20px;">
                                    <h2 style="color: #334257; font-size: 22px;">Join us now!</h2>
                                    <p style="font-size: 18px; margin-bottom: 5px;">The 4-digit code</p>
                                    <h2 style="font-size: 50px; margin: 0; color: #0077C8; letter-spacing: 4px;">
                                        ${otp}
                                    </h2>
                                </td>
                            </tr>
                            <tr>
                                <td style="text-align: center; padding: 20px 0;">
                                    <hr style="border: 2px solid #F4DA40; box-shadow: none; margin: 0;">
                            </td>
                            </tr>
                            <tr>
                                <td style="text-align: center; padding-bottom: 20px;">
                                    <p>Having some difficulties? Let us know at <a href="mailto:hello@natt.world" style="color: #0056A1;">hello@natt.world</a>.</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="text-align: center; padding-top: 20px;">
                                     <div style="padding-top: 20px; display: block; box-sizing: border-box;">
                        Yours sincerely,
                    </div>
                    <div style="margin-bottom: 20px; display: block; box-sizing: border-box;">
                        NATT Team
                    </div>
                                </td>
                            </tr>
                        </table>
                        <table align="center" style="width: 100%; max-width: 600px; text-align: center; padding-top: 20px;">
                            <tr>
                                <td style="font-size: 12px; color: #999999;">
                                    2022 - 2025 © NATT.WORLD, All rights reserved.
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </div>
        `,
    };

    console.log(`Sending OTP ${otp} to ${email}`);
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email successfully sent to: ${email}`);
        return true;
    } catch (error) {
        console.error('Error while sending email:', error);
    }
}

module.exports = { sendEmail };
