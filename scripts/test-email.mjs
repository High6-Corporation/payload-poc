/**
 * SMTP2GO email integration test for payload-poc.
 *
 * Usage: node --import=tsx/esm scripts/test-email.mjs
 *
 * Sends a test email through Payload's configured nodemailerAdapter
 * (mail.smtp2go.com:2525) to verify the transport is working.
 */
import 'dotenv/config';
import { getPayload } from 'payload';
import config from '../src/payload.config.ts';

const TEST_RECIPIENT = process.env.TEST_EMAIL_RECIPIENT || 'josh@anthropic.com';

async function main() {
  console.log('Initializing Payload...');
  const payload = await getPayload({ config });

  console.log(`Sending test email to ${TEST_RECIPIENT}...`);
  const result = await payload.sendEmail({
    from: process.env.SMTP2GO_FROM_EMAIL || 'no-reply@h6app.site',
    to: TEST_RECIPIENT,
    subject: 'Payload SMTP2GO Integration Test',
    text: [
      'This is a test email from the payload-poc SMTP2GO integration.',
      '',
      'If you received this, the nodemailerAdapter transport is working',
      'correctly through mail.smtp2go.com:2525.',
      '',
      'Template variable replacement in the form-builder plugin\'s emails[]',
      'config should also work with this transport.',
    ].join('\n'),
    html: [
      '<h2>Payload SMTP2GO Integration Test</h2>',
      '<p>This is a test email from the <strong>payload-poc</strong> SMTP2GO integration.</p>',
      '<p>If you received this, the <code>nodemailerAdapter</code> transport is working',
      'correctly through <code>mail.smtp2go.com:2525</code>.</p>',
      '<hr/>',
      '<p><small>Template variable replacement in the form-builder plugin\'s',
      '<code>emails[]</code> config should also work with this transport.</small></p>',
    ].join('\n'),
  });

  console.log('✅ Email sent successfully!');
  console.log('Message ID:', result?.messageId || 'N/A');
  console.log('Check SMTP2GO activity log at: https://app.smtp2go.com/reports/activity/');
}

main().catch((err) => {
  console.error('❌ Email send failed:', err.message);
  if (err.cause) console.error('  Cause:', err.cause);
  process.exit(1);
});
