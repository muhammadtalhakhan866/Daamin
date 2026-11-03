# Admin page: one-time setup

The admin page lives at **https://daamin.vercel.app/admin/** (it is not linked from the site).
From there you can change the pictures in each project album (up to 10 each) and the three
featured videos, their thumbnails, titles and descriptions.

## Before it will let you in: set the password (once)

The password is **not** stored in the code. It is a setting in Vercel, so only you know it.

1. Open the Daamin project on vercel.com, then **Settings > Environment Variables**.
2. Add a variable named `ADMIN_PASSWORD`. Use a long, unique password (12+ characters).
   Tick **Production** (and Preview if you like).
3. **Redeploy** (Deployments > the latest one > Redeploy). Settings only apply to new deployments.

Until this is done the login page says the password has not been set up.

To change the password later, edit the variable and redeploy. Everyone is signed out when it changes.

## Using it

- **Projects:** every project has its own panel. Change the name, the location shown on the tile,
  the status (Completed, Under construction... or leave empty for none), the type (decides which
  filter button it appears under) and the description shown when the picture is opened.
  **+ Add a new project** at the top makes a new tile: it needs a name and at least one picture,
  and appears first on the site and in the contact form's project list. New projects can be removed
  again with **Remove project**; the projects the site shipped with can be edited but not deleted.
- **Project pictures:** add pictures (JPG, PNG or WebP; they are resized in your browser first),
  reorder with the arrows, make one the cover with the star, remove with the cross.
  Each album holds at most 10. The first picture is the cover shown on the project tile.
  Every picture has a date menu under it: **Today's date**, **Choose a date**, or **Don't show a date**.
  New uploads start on today's date. On the site the first picture's date slides in on the project tile when
  the mouse is over it, and the opened album shows it at the bottom right ("Added 3 weeks ago" with the exact day).
  Pictures that shipped with the site have no date until you set one.
- **Featured videos:** replace a video and a thumbnail is taken from it automatically
  (you can upload your own thumbnail instead). Edit the title and description underneath.
  Keep videos under about 70 MB so they start quickly on phones.
- Nothing changes on the site until you press **Publish changes**.
  After publishing, allow about half a minute for the live site to show it.
- **Reset to original** on any project or video puts back what shipped with the site.

## Customer reviews

Under the review slider there is a **Write a review** button. A visitor fills in their name,
WhatsApp number, the service, a star rating and their review, and ticks a box agreeing to
have it shown. **Nothing appears on the website until you approve it.**

In the admin page open the **Customer reviews** tab:

- **Waiting** shows new reviews. Each one shows the customer's WhatsApp number with a
  **Message on WhatsApp** button, useful if you want to talk to someone about a bad review.
- You can correct spelling, the name, the service or the stars before approving.
  The customer's original wording is kept (open "See the customer's original wording").
- **Approve and publish** puts it on the website (allow about a minute). **Reject** keeps it
  off. **Take off the website** and **Move back to waiting** undo an approval. **Delete**
  removes it for good.
- The tab title shows how many are waiting, but there is no email alert yet: check the tab
  now and then.

Privacy: the WhatsApp number is stored only in a separate **private** storage area
(`daamin-reviews`) and is shown only on this admin page. It is never sent to the public
website. A visitor can send at most 4 reviews an hour. The 50 reviews already on the site are
unchanged and are not edited here.

## Where things are kept

Uploaded files and your changes live in a Vercel Blob store called `daamin-media`
(a free allowance applies on the Hobby plan; see Vercel > Storage for usage).
Anything you remove or replace is deleted from storage automatically.
