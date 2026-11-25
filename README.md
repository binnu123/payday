# Payday

1. Supabase: run `supabase.sql` in the SQL Editor. (Optional: Auth > Providers > Email > turn off "Confirm email" for instant signup.)
2. Put your project URL and anon key in `www/config.js`.
3. Push this folder to a GitHub repo (branch `main`).
4. GitHub > Actions > "Build APK" > open the run > download the `payday-apk` artifact, unzip, install `app-debug.apk`.

## Live updates (Capgo)

The app includes the Capgo updater. To activate it, register `com.payday.tracker` in a Capgo account, create a production channel and set it as the default for devices. Configure the account's upload API key as the GitHub repository Actions secret `CAPGO_TOKEN`; never commit the key. See https://capgo.app/docs/getting-started/add-an-app/ and https://capgo.app/docs/live-updates/channels/.

Build and install an APK containing the updater once. For subsequent web-only changes, push the code, then run GitHub Actions > "Publish live update" on the desired branch with a unique semantic bundle version (for example `1.0.1`). The workflow is manual so database migrations and native compatibility can be checked before release. Test the first update on a device and use Capgo's channel controls to roll back if necessary.

Updates require network access and apply according to Capgo's update behavior; they do not change native plugins, Android permissions or native configuration. Such changes still require a new APK. Apply any required Supabase SQL migrations separately before releasing the dependent web bundle. Do not put private credentials in the web bundle.
