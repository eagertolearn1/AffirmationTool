const { z } = require('zod');

const signupSchema = z.object({
  name:               z.string().min(1, 'Name is required').max(100),
  email:              z.string().email('Invalid email'),
  whatsapp_number:    z.string().regex(/^\+?[1-9]\d{9,14}$/, 'Invalid WhatsApp number').optional(),
  whatsapp_opted_in:  z.boolean().default(false),
  age_confirmed:      z.literal(true, { errorMap: () => ({ message: 'You must confirm you are 18 or above' }) }),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
});

const verifyOtpSchema = z.object({
  email: z.string().email('Invalid email'),
  otp:   z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
});

module.exports = { signupSchema, loginSchema, verifyOtpSchema };
