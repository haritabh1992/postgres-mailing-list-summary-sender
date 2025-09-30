# Email Confirmation Flow Test Guide

## Prerequisites
1. Make sure Supabase functions are deployed: `supabase functions deploy`
2. Make sure frontend dependencies are installed: `cd frontend && npm install`
3. Make sure environment variables are set in `.env` file

## Test Steps

### 1. Test Subscription Flow
1. Start the frontend: `cd frontend && npm run dev`
2. Open the application in your browser
3. Enter a test email address and click "Subscribe"
4. Check that you see the message: "Please check your email and click the confirmation link to complete your subscription"

### 2. Test Database State
1. Check the `subscribers` table in Supabase dashboard
2. Verify the new subscriber has:
   - `confirmation_status = 'pending_confirmation'`
   - `is_active = false`
   - `confirmation_token` is set
   - `confirmation_expires_at` is set to 24 hours from now

### 3. Test Confirmation Email
1. Check your email for the confirmation message
2. Verify the email contains:
   - Professional HTML design
   - Confirmation button/link
   - Expiration warning (24 hours)
   - Correct confirmation URL format

### 4. Test Confirmation Link
1. Click the confirmation link in the email
2. Verify you're redirected to `/confirm?token=...`
3. Check that the confirmation page shows:
   - Loading state initially
   - Success message after confirmation
   - Correct email address displayed

### 5. Test Database After Confirmation
1. Check the `subscribers` table again
2. Verify the subscriber now has:
   - `confirmation_status = 'confirmed'`
   - `is_active = true`
   - `confirmed_at` is set
   - `confirmation_token` is null
   - `confirmation_expires_at` is null

### 6. Test Edge Cases
1. **Expired Token**: Wait 24+ hours and try the confirmation link
2. **Invalid Token**: Try accessing `/confirm?token=invalid`
3. **Duplicate Subscription**: Try subscribing with the same email again
4. **Already Confirmed**: Try confirming an already confirmed subscription

## Expected Results

### Successful Flow
- User subscribes → Pending confirmation in DB
- Confirmation email sent → User receives email
- User clicks link → Subscription confirmed
- User becomes active subscriber

### Error Handling
- Invalid/expired tokens show appropriate error messages
- Duplicate subscriptions are handled gracefully
- Network errors are handled with user-friendly messages

## Troubleshooting

### Common Issues
1. **RLS Policy Error**: Make sure migration `20240101000003_fix_rls_policy.sql` was applied
2. **Function Not Found**: Deploy Supabase functions with `supabase functions deploy`
3. **Email Not Sent**: Check SendGrid API key configuration
4. **Confirmation Page Not Loading**: Check that react-router-dom is installed

### Debug Steps
1. Check browser console for errors
2. Check Supabase function logs
3. Check database for correct data
4. Verify environment variables are set
