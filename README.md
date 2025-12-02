# VibeCode1
First iteration for vibecoding in the study

What we are building:

A student organization needs a snack kiosk software system where the students can by some snacks and drinks. The software should be web-based to enable an admin to access the system remotely. In the software the products are shown and need to have a title, a picture and a price. From the touch screen the students should be able to select the product(s) they wish to purchase and then the paymen should be handled via MobilePay transaction system with a QR code. 

The admin should be able to access the system remotely and do the following actions: check the inventory, update the inventory, see some statistics about how the product are selling. The admin should be able to disable the inventory so that the web app acts just as a ‘pick your poducts and pay’. 

Needs for the build:

Docker integration so that all dependencies are already installed and build is simple.

Generally use best practices.

Stack:

React with typescript where possible, PostgreSQL, node, express
Latest stable releases for the versions.

GitHub actions only for build

## Admin Authentication Setup

- Copy `server/.env.example` to `server/.env` (or set environment variables another way) and replace placeholder values, especially `ADMIN_SESSION_SECRET` and SMTP credentials if password reset emails should send.
- When the database seeds for the first time it now creates an `admin@localhost` user with a random password printed to the console (development only). Change this password immediately and disable `AUTO_SEED` once production data exists.
- Update the `docker-compose.yml` environment block to mirror your secrets when running locally with containers.

## Admin Image Uploads

- Admin clients can upload product images via `POST /admin/uploads` with the `image` field; the request must include the `x-admin-token` header.
- Accepted formats: JPEG, PNG, and WebP. Files larger than the configured maximum are rejected with a helpful error.
- Uploaded files are saved under the directory pointed to `UPLOADS_DIR` (default: `<repo>/server/uploads`). The API serves them read-only at `/uploads/<filename>`.
- Adjust limits through environment variables:
	- `UPLOADS_DIR`: absolute or relative path to the writable uploads directory.
	- `UPLOAD_MAX_SIZE_MB`: maximum allowed file size in megabytes (defaults to 5).
- Development `docker-compose.yml` maps `./server/uploads` into the API container so uploads persist between restarts. Ensure the host path remains writable when running inside Docker Desktop.