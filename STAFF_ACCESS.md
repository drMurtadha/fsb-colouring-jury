# Registration staff access

Admin: open **Petugas**, enter the staff member's name and WhatsApp number, then **Tambah**. Use **Hantar melalui WhatsApp** or **Salin pautan**. Messages are sent only when the admin chooses to send them.

A staff member opens their personal `/admin/?s=...` link. The token is removed from the address bar and stored separately from the admin key. The registration desk can search, check in or undo check-in, add walk-ins, edit registration contact details, and print named QR labels. Existing IDs and QR payloads remain unchanged.

Staff cannot manage juries or staff accounts, view scores, calculate or publish results, change settings, sync the source form, delete participants, change eligibility/status, or change an existing participant's age category. Those restrictions are enforced by separate backend endpoints and an allowlist, not by hidden navigation alone. Government ID numbers, email addresses, jury tokens, and marks are not returned to staff.

**Nyahaktif** immediately prevents subsequent API requests. **Jana semula pautan** replaces the token, invalidating the old link. A personal link is a credential; do not share it publicly. Do not commit real invitations or tokens.

## Deployment

1. Back up the current Apps Script `Code.gs` and `Sheets.gs` and record its current deployment version.
2. Update both files from this commit. Existing spreadsheet data and keys must be kept. The `Staff` sheet is created lazily by the sheet helper; no reseeding or data reset is required.
3. Update the existing web-app deployment to a new version, retaining its URL, execute-as identity, and access setting.
4. GitHub Pages publishes `admin/app.js` and `print/app.js` normally. The Petugas tab requires the new backend.
5. Test one staff link, including denial of admin/jury endpoints, and revoke the test link. Do not send invitations before deployment is verified.

Rollback: select the previous Apps Script deployment version and restore the previous frontend commit. Do not delete participant data or the Staff sheet.

## Validation

`node tools/test-staff.js` checks the role boundary, field restrictions, ID preservation, walk-in allocation, audit attribution, redacted response shape, rotation, and revocation. Existing backend tests M1, M2 and M6 must pass as well.
