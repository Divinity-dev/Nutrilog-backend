# NutriblogHub security setup

These changes are on `feature/nutriblog-upgrade`; production `main` is unchanged.

## Backend environment variables

Set these in the backend hosting environment (Preview first, then Production after testing):

- `ADMIN_EMAIL=divine_asiriuwa@yahoo.com`
- `JWT_SECRET`: a new, unique random secret of at least 32 bytes. Do not reuse the old `crypto_key`.
- `ADMIN_BOOTSTRAP_SECRET`: a separate, one-time random secret used only to initialize the administrator account.
- Keep the existing `crypto_key` temporarily. Existing accounts use the legacy AES format and are migrated to scrypt password hashes the next time each user logs in successfully.
- Keep the existing MongoDB connection variable and other current settings unchanged.

Do not commit real secrets to GitHub or send them in chat.

## Initialize the administrator once

1. Deploy the backend preview with the variables above.
2. Register a NutriblogHub account using `divine_asiriuwa@yahoo.com` and a strong password. Registration does not grant admin privileges.
3. Make a one-time POST request to `/api/user/bootstrap-admin` with JSON body `{"bootstrapSecret":"YOUR_ADMIN_BOOTSTRAP_SECRET"}`.
4. The backend checks that the account email matches `ADMIN_EMAIL`, promotes that account to admin, and sets the secure session cookie. A second bootstrap attempt is rejected.
5. Log in normally from the website using the Yahoo administrator account.

The bootstrap secret should be removed from the hosting environment after successful initialization. The admin role remains stored on the user record.

## Authentication behavior

- Passwords for new accounts are stored using Node.js scrypt.
- Existing AES-encrypted passwords are verified and migrated to scrypt after a successful login.
- Session JWTs are stored in an HttpOnly cookie, not in localStorage.
- Article creation, editing, deletion, category creation, and subscriber-list access require the admin role.
- Public article reading and newsletter subscription remain public.
- Keep the legacy `crypto_key` until all existing users have logged in and migrated, or until a deliberate password-reset migration is completed.
