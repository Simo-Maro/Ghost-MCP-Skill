# Ghost Publishing

Editorial publishing, media preparation, and content management for self-hosted Ghost sites.

## Language

**Site**:
A single Ghost publication managed as an independent publishing target.
_Avoid_: Blog, Ghost instance, workspace

**Post**:
A time-ordered piece of editorial content published in a Site's main feed and RSS.
_Avoid_: Article, entry, story

**Page**:
A standalone document on a Site—such as About, Contact, or Privacy Policy—excluded from chronological feeds and RSS.
_Avoid_: Static post, doc page

**Draft**:
An unpublished Post or Page accessible only inside Ghost Admin and excluded from public URLs, feeds, and search indexing.
_Avoid_: Unpublished post, WIP

**Tag**:
A taxonomy label attached to Posts or Pages; public Tags generate archive pages, whereas internal Tags (prefixed with `#`) organize content privately.
_Avoid_: Category, label, topic

**Editorial Profile**:
A Site-specific brief capturing a Site's niche, target audience, language, editorial voice, and authorship identity.
_Avoid_: Blog config, persona file, prompt file

**Feature Image**:
The primary visual asset attached to a Post or Page, used in feeds, social cards, and structured data.
_Avoid_: Cover image, hero banner, thumbnail

**Readiness Audit**:
A read-only evaluation of a Site's Pages, metadata, Tags, author completeness, and public crawler files against SEO and Google AdSense prerequisites.
_Avoid_: Site check, health check, lint report
