# Fix Supabase Email Redirect to withmonty.com

## Problem
New users confirming their email are being redirected to `localhost:3000` instead of the production site `https://withmonty.com`.

## Root Cause
Your Supabase project's authentication settings have the **Site URL** set to `http://localhost:3000`, which is being used for email confirmation links.

## Solution

We've made **code changes** to fix this issue (see the commit), but you also need to check your **Supabase dashboard settings**.

### Code Changes Made
Updated `app/auth/login/page.tsx` to use hardcoded production URL (`https://withmonty.com/auth/callback`) instead of dynamic `window.location.origin`. This ensures consistent redirects regardless of where the signup occurs.

### Supabase Dashboard Configuration

### Step 1: Access Supabase Dashboard
1. Go to [https://supabase.com](https://supabase.com) and sign in
2. Select your **options-trader-portfolio** project
3. Navigate to **Authentication** → **URL Configuration** (in the left sidebar)

### Step 2: Update Site URL
Find the **Site URL** field and update it to:
```
https://withmonty.com
```

**Important**: This is the PRIMARY URL that Supabase will use for all email confirmation links.

### Step 3: Update Redirect URLs
In the **Redirect URLs** section, add:

```
https://withmonty.com/auth/callback
```

**Note:** We've hardcoded the production URL in the application code, so you only need the production URL here. If you need to test locally in the future, you can temporarily add `http://localhost:3000/auth/callback`.

### Step 4: Check Email Templates (CRITICAL!)
This is often the hidden culprit! Supabase email templates can have hardcoded URLs.

1. Go to **Authentication** → **Email Templates** (left sidebar)
2. Check the **Confirm signup** template
3. Look for any instances of `localhost:3000` in the template
4. If you see `{{ .ConfirmationURL }}` - that's good! It's using the dynamic URL
5. If you see hardcoded URLs like `http://localhost:3000/...` - replace them with `{{ .SiteURL }}/auth/callback` or just use the template variables

**Common issue:** Email templates that were customized during development often have localhost hardcoded.

### Step 5: Test
1. Create a new test account by signing up at `https://withmonty.com/auth/login`
2. Check your email for the confirmation link
3. **Before clicking:** Hover over the link and check the URL - it should start with `https://withmonty.com`
4. Click the confirmation link
5. You should now be redirected to `https://withmonty.com/portfolio` (not localhost)

## Additional OAuth Configuration (if using Google Sign-In)

If you're using Google OAuth, you also need to:

1. In Supabase, go to **Authentication** → **Providers**
2. Click on **Google**
3. Make sure the redirect URI includes: `https://withmonty.com/auth/callback`

## Troubleshooting

### "Invalid redirect URL" error
- Make sure you added the exact URLs to the Redirect URLs list
- Check for typos (common: `http` vs `https`, trailing slashes)
- Wait a few seconds after saving for changes to propagate

### Email links still go to localhost
- Clear your browser cache
- Make sure you saved the Site URL change in Supabase
- Try signing up with a different email address (old confirmation emails may still have the old URL)

### Development testing broken
- Make sure `http://localhost:3000/auth/callback` is still in the Redirect URLs list
- The code uses `window.location.origin` during signup, so local dev will still work

## How It Works

When a user signs up, the authentication flow is:

1. User submits email/password on `/auth/login`
2. Code calls `supabase.auth.signUp()` with `emailRedirectTo: window.location.origin + /auth/callback`
3. Supabase sends a confirmation email with a link containing a code
4. **The URL in the email uses the "Site URL" from Supabase settings** (this is the key!)
5. User clicks the link → Redirected to `/auth/callback` on the Site URL domain
6. The callback route exchanges the code for a session
7. User is redirected to `/portfolio`

By setting **Site URL** to `https://withmonty.com`, all email confirmation links will use the production domain.
