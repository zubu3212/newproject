# NOVATEK storefront

## Run locally

1. Install Node.js and PostgreSQL.
2. Create the `novatek` PostgreSQL database and set `PG*` connection settings in `.env`.
3. Keep the existing `.env` database values. For a fresh setup, copy `.env.example` to `.env` and fill in your PostgreSQL password. Set a long, random `SESSION_SECRET` for deployments.
4. Run `npm install`, then `npm start`.
5. Open `http://localhost:8001/`. Visitors are sent to the login page first. New password accounts collect contact and delivery details during sign-up; returning customers can review and edit their details from the profile page.

The server creates the required tables and initial category/product records when it starts. It also tops up the PostgreSQL catalog to 20 smartphones, 20 laptops, 10 audio products, 20 wearables, and 30 accessories, without duplicating seeded products on restart. Each product gets an individual, locally generated illustration suited to its category and product type; these images do not depend on external image hosts. Product prices and image paths come from PostgreSQL. The cart is saved per signed-in user; Buy Now opens the cart, and checkout creates a cash-on-delivery order in PostgreSQL. Shipping is $9 below $99 and free for orders of $99 or more. The support form also saves requests in PostgreSQL. The `database.sql` file is available for manual database setup; starting the app applies the full catalog seed.

## Admin order dashboard

To make an existing account an administrator, set `ADMIN_EMAIL` in your private `.env` to that account's exact email address, restart the server, then sign out and sign back in. The server assigns the admin role to that matching account. Open `/admin` directly, or use **Open admin dashboard** on the account page. The admin dashboard shows sales/order summaries, lets administrators search/add/edit/delete products, update order statuses, and review customers. Deleting a product removes its active cart entries but preserves historical order line details. Both the page and all admin APIs verify the user's current admin role. Do not use an email address you do not control.

The signed-in `/profile` page displays saved name, contact, delivery location, account creation date, and recent orders in read-only profile cards. Users can explicitly choose **Edit** to update their name, phone number, or saved delivery address, review order totals, and change their password. Orders in `placed` or `processing` status can be cancelled from the profile; cancelled orders remain in history, and orders in later statuses cannot be cancelled by customers. Checkout saves the submitted delivery details to that account and pre-fills them the next time.

Store navigation links open separate signed-in routes for the shop, category list, new arrivals, deals, support, profile, and cart. Category cards open the shop filtered to that category. The admin navigation also has separate `/admin/orders`, `/admin/products`, and `/admin/customers` pages.

## OAuth provider setup

Google, Apple, and X use their real OAuth authorization-code flows; their buttons need provider applications before they can sign in. Add the respective client credentials to your private `.env` file and register the exact callback URL shown below:

- Google: `http://localhost:8001/auth/google/callback`
- X: `http://localhost:8001/auth/x/callback`
- Apple: `https://YOUR-REGISTERED-DOMAIN/auth/apple/callback`

For Apple, set `APP_URL` to the registered HTTPS origin and provide the Services ID as `APPLE_CLIENT_ID`, plus the Team ID, Key ID, and private `.p8` key. Put the private key in `.env` with newline characters escaped as `\n`. Apple does not support this local HTTP callback, so its flow must be tested on the registered HTTPS site.

For Google, provide `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. For X, provide `X_CLIENT_ID`; confidential clients should also set `X_CLIENT_SECRET`. Do not paste secrets into source files or commit `.env`.

## Pages

- `/login.html` — sign in and provider options
- `/signup.html` — create a password account
- `/home` — signed-in storefront home
- `/shop`, `/categories`, `/new-arrivals`, `/deals`, `/support` — separate signed-in navigation pages
- `/profile` — signed-in account page
- `/cart` — persistent cart and cash-on-delivery checkout
# newproject
