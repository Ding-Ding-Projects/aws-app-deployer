# Signing in to AWS

The app uses AWS CLI browser sign-in for IAM Identity Center.

- Choose a profile in Accounts and press **Sign in with browser**.
- Approve the request in your browser. The window comes back to the front by itself.
- The app checks who you are with AWS STS and shows the account ID, role, ARN, profile and region.

Tokens are never shown. Each Windows user keeps their own profiles. Signing in to AWS gives the app permission to deploy; it never adds a sign-in to your deployed site.
