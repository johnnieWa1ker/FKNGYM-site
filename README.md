# FKNGYM Public

Public website and legal pages for FKNGYM.

## Pages

- `https://fkngym.com/` - app landing page
- `https://fkngym.com/privacy/` - Privacy Policy
- `https://fkngym.com/terms/` - Terms of Use, Apple Standard EULA, subscriptions, and export restrictions
- `https://fkngym.com/support/` - developer contact, subscription help, and privacy requests

The homepage and document navigation link to all three legal/support pages. The
website supports every locale in the app's `Resources/Localizable.xcstrings`:
29 locales currently, including Arabic/Hebrew RTL and both Chinese scripts.
Full English content, links, and source prices are embedded in HTML for readers
without JavaScript. Other dictionaries load on demand from `locales/`.

Choose a language in the header or footer, or use `?lang=ru`, `?lang=pt-BR`,
`?lang=zh-Hant`, etc. Browser matching preserves Chinese script and supports
region variants such as `en-GB` and `zh-TW`. The language and explicitly selected
App Store region are saved locally when browser storage is available.

## Pricing sources and synchronization

`Resources/Prices.storekit` in the sibling FKNGYM checkout is the source for
subscription IDs, base prices, billing periods, introductory trials, and
localized product names. `Resources/Localizable.xcstrings` determines the
website's locale list. The importer reads both files without changing the app.

```sh
npm run sync
npm run sync:check
npm run dev
npm run build
npm test
```

Node.js 22+ is required; there are no npm dependencies or install step.
The default app directory is `../FKNGYM`. Override it with `FKNGYM_APP_ROOT`,
or use `npm run sync -- --app-root /path/to/FKNGYM`.

- `sync` updates the public allowlisted snapshot in `data/app-data.json` and the
  English HTML fallback. It does not copy the private app source or signing data.
- `sync:check` fails when the checked-in snapshot or fallback HTML is stale.
- `dev` serves `http://127.0.0.1:8765/`, watches the website and both app files,
  regenerates data, and reloads the browser after edits. It must be running for
  local file changes to appear automatically.
- `build` reimports the sibling app, validates all translations, and writes only
  public site files to `dist/`. `build -- --snapshot` explicitly builds from a
  previously generated snapshot when the sibling checkout is unavailable.
- `test` exercises currency isolation, locale matching, imports, Apple price
  selection, pagination, and signing. It does not make purchases or change ASC.

The current StoreKit file contains **1.99 USD monthly**, **12.99 USD annually**,
and a **3-day free trial** on the annual plan. It selects the USA storefront.
Its product localizations do not contain regional prices. Localized number,
period, and country labels are generated using Node’s full ICU data into
`data/formats.json`, so browsers with incomplete locale support (for example,
Georgian in some WebKit builds) show the same localized pricing. Changing the website
language formats these USD values for that language; it never converts them to
rubles, euros, or another currency by relabeling the number.

### Actual regional Apple prices

`npm run prices:apple` reads current configured subscription prices, billing-plan
territory availability, and active free trials through App Store Connect API.
It writes `data/regional-prices.json` only after both subscriptions validate.
It excludes future prices, preserved legacy prices, and other billing-plan
variants. Every pagination page is read. Only GET requests are made; the script
never changes pricing or subscription configuration in App Store Connect.

Configure `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, and either
`APPSTORE_PRIVATE_KEY` or `ASC_KEY_PATH` (a path to an existing `.p8` key).
These match the app release workflow's names. Keep keys in local environment
variables or GitHub Actions secrets. Never place a key in HTML, JavaScript,
`data/`, a committed `.env`, or the public build. No credentials are configured
by this repository.

After export, run `npm run build -- --snapshot`. The browser reads the generated
JSON; it never calls authenticated Apple endpoints. A separate App Store country
or region selector controls prices. Language suggests an initial region when
that region is available, while a user's explicit region choice persists across
language changes and document navigation (`?market=USA`, `?market=DEU`, etc.).
Missing territories in a real Apple snapshot are not filled with US prices.
Trial eligibility is still determined by the user's Apple Account.

Until the first successful API export, `data/regional-prices.json` has no source
and the site clearly shows the USA/USD data from StoreKit. The regional API
integration has fixture-based tests, but must be verified against the actual
account with an authorized key before publication. Refresh the snapshot before
publishing pricing changes; a deployed static site cannot read local app files
or fetch new prices by itself.

### GitHub Actions

**Pages build deployment** builds and publishes `dist/` after each push to
`main`, and can also be started manually on `main`. It uses the committed public
data snapshots, so ordinary website deployment needs neither the app checkout
nor App Store Connect credentials. Set Settings → Pages → Source to
**GitHub Actions**. Both publishing workflows share a concurrency group to
prevent simultaneous deployments.

The manual **Refresh website data** workflow checks out this website and the app
repository (`johnnieWa1ker/Kratos`, the current remote of the FKNGYM checkout),
synchronizes the app data, exports Apple prices, runs validation, and uploads a
complete `fkngym-website` artifact. Copy the three `APPSTORE_*` secrets into this
website repository, and provide `FKNGYM_SOURCE_TOKEN` with read-only access to
the app repository if it is private. Secrets from the app repository are not
automatically available here.

The **publish** input defaults to false. Enable it on a manual run to deploy to
GitHub Pages after setting Pages → Source to **GitHub Actions**. The workflow
has no recurring schedule and has not been run or deployed by these changes.
To make refreshed prices part of subsequent automatic deployments, commit the
refreshed public snapshots and HTML after running the local sync/export commands.
Publishing a manual refresh does not update the committed snapshots.

## App Store and app integration

Use these URLs after deploying and verifying the public pages:

| Destination | URL |
| --- | --- |
| Privacy Policy URL | `https://fkngym.com/privacy/` |
| Support URL | `https://fkngym.com/support/` |
| Website explanation of terms and subscriptions | `https://fkngym.com/terms/` |
| Governing license / Terms of Use link in App Store description | `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/` |

The terms page explains Apple's Standard EULA; it is not a custom EULA. Keep the
standard-license selection in App Store Connect consistent with this page.
Section (g) of that agreement contains export and re-export restrictions. Website
text does not replace encryption declarations, supporting export documentation
when required, or territory settings in App Store Connect.

The changes address the website side of F2, F3, W4, and U3 in the related app's
`Docs/app-store-review.md` audit dated September 9, 2026. In-app entry points,
privacy manifests, StoreKit behavior, and App Store Connect settings are handled
separately in the app project. This repository does not change them.

Before submission, verify the deployed URLs without authentication, confirm that
`support@fkngym.com` receives mail and replies work, and reconcile the policy with
the final production build and App Privacy answers. Mailbox operation cannot be
established by checking a `mailto:` link. Confirm that support handling and
retention match the published policy, including the email provider's protection
of correspondence, and add the actual developer/trader details where required
for the selected distribution territories.

The policy describes local workout storage and distinguishes device backups from
CloudKit synchronization. Update it if the app later enables synchronization or
adds a data processor. The App Store purchase screen remains the final authority
for the individual customer’s price and offer eligibility.

## Editing translations

Website dictionaries live in `locales/<BCP47-tag>.json`. They contain the same
keys for the homepage, Privacy Policy, Terms, and Support. Preserve HTML link
URLs and `{period}`, `{price}`, `{market}`, and `{currency}` placeholders.
`npm run build` checks key, placeholder, and link parity for every app locale;
a newly added app language must have a complete website dictionary before it
can be published. StoreKit product names override website plan labels when an
exact compatible source localization exists. Georgian currently uses website
plan labels because StoreKit has no Georgian product localization.

Update English text in `locales/en.json`, translate corresponding values into
all other locale files, and run `npm run sync` to refresh English HTML fallback.
Check document links and responsive layouts after editing longer translations.

References: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
[Apple Standard EULA](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/),
[Apple Media Services terms](https://www.apple.com/legal/internet-services/itunes/),
[cancellation](https://support.apple.com/en-us/118428),
[restoration](https://support.apple.com/en-us/108096), and
[refunds](https://support.apple.com/en-us/118223).

## GitHub Pages

The **Pages build deployment** workflow publishes `dist/` from `main` through
GitHub Actions. The manual **Refresh website data** workflow can also publish
after refreshing data from the app and Apple.

Custom domain:

```txt
fkngym.com
```

Configure the custom domain in Settings → Pages. The `CNAME` file remains in the
repository and build output, but Actions deployments do not configure the
domain from this file.

The site is a plain static page:

- `index.html`
- `privacy/index.html`
- `terms/index.html`
- `support/index.html`
- `styles.css`
- `script.js` and `pricing.js`
- `locales/`
- `data/`
- `assets/`
- `CNAME`

Pricing API references: [configured subscription prices](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-subscriptions-_id_-prices),
[plan availability](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-subscriptions-_id_-planavailabilities),
and [Apple price equalization](https://developer.apple.com/documentation/appstoreconnectapi/querying-adjusted-subscription-price-equalizations).
The site exports configured prices rather than computing exchange-rate estimates.

## Shared navigation layout

FKNGROUP and FKNGYM use an 80px desktop header and a second navigation row at
1100px and below. Header and footer height grows with wrapped translations.
Keep the shared chrome sizing rules in both repositories aligned when editing.

The homepage and all document pages use the same sticky header. Language flags
appear in both the searchable picker and native select fallback. The G in the
wordmark periodically transitions to the brand accent; reduced motion disables
this effect. Footer links to FKNGROUP preserve the selected language.
