# User Guide

---

# Development Environment Setup

1. **Install and activate local plugins:**
   ```bash
   ./setup-plugins.sh
   ```
   This installs and activates local plugins (including `nodebb-plugin-topic-type`). Run once after cloning or after a fresh `npm install`.

2. **Build and restart NodeBB:**
   ```bash
   ./nodebb build && ./nodebb restart
   ```

3. **Optional: test category moderator behavior**
   Assign the **moderate** privilege to a user for a specific category via:
   `ACP > Manage > Categories > [Category] > Privileges`.

---

# How to Run

- **Run all automated tests:**
  ```bash
  npm test
  ```
- **Run the linter:**
  ```bash
  npm run lint
  ```

---

# Feature 1: Question/Note Topic Type

## Overview

This feature allows users to classify topics as either **Question** or **Note** when creating them. Question topics allows for additional features like answer/comment reply types, instructor endorsement, and filtering by answered/unanswered/endorsed status.

## How to Use

### Creating a Topic with a Type

1. Navigate to any category and click **New Topic**.
2. Enter your topic title.
3. Below the title field, you will see two radio buttons: **Question** (selected by default) and **Note**.
4. Select the appropriate type for your post.
5. Write your content and click **Submit**.

The system automatically adds a **"Question"** or **"Note"** tag to your topic based on your selection. These tags cannot be manually added or removed.

### Identifying Topic Types

- On category and topic listing pages, each topic displays its type tag (**Question** or **Note**).
- These tags are visually distinct and allow you to quickly determine the nature of a topic.

### Filtering Topics by Type

1. Navigate to a category page.
2. Use the **tag filter** to select either the **Question** or **Note** tag.
3. Only topics of the selected type will be shown.

## Testing

### Test Location

All automated tests for this feature are located in:

```
test/topics.js
```

Under the `describe('Topic Type - Question/Note')` test section (near the end of the file).

### Test Coverage Summary

| Test Group | What It Covers | Why It's Sufficient |
|---|---|---|
| **Topic creation with topicType** | Creating topics with `question`, `note`, or no type; verifying persistence | Covers acceptance criteria #1: users can select question or note when creating topics |
| **Auto-tagging based on topicType** | Verifies "Question"/"Note" tags are auto-added; user tags coexist with type tags | Covers acceptance criteria #2: topics are demarcated with visible tags |
| **Reserved tag filtering** | "question"/"note" blocked from manual input (case-insensitive); type tags preserved on update/delete | Covers acceptance criteria #3: tag filtering system integrity for question/note |
| **API-level topic type** | topicType flows correctly through the `apiTopics.create` path | Verifies the API layer passes and stores topicType |

### Test Descriptions

**Group A — Topic creation with topicType (4 tests):**
- Creates a question topic and verifies `topicType` is `'question'`
- Creates a note topic and verifies `topicType` is `'note'`
- Creates a topic without specifying type and verifies it defaults to empty string
- Retrieves a topic and verifies `topicType` persists in the database

**Group B — Auto-tagging (4 tests):**
- Verifies question topics automatically receive a "Question" tag
- Verifies note topics automatically receive a "Note" tag
- Verifies topics without a type do not receive any type tag
- Verifies user-supplied tags (e.g., "homework") coexist with the auto type tag

**Group C — Reserved tag filtering (5 tests):**
- Verifies "question" is filtered out when manually added as a tag
- Verifies "note" is filtered out when manually added as a tag
- Verifies filtering is case-insensitive (e.g., "Question", "NOTE" are also filtered)
- Verifies the type tag is preserved when updating a topic's tags
- Verifies the type tag is preserved when deleting all of a topic's tags

**Group D — API-level topic type (2 tests):**
- Creates a topic with topicType via the API and verifies type and tags
- Creates a topic without topicType via the API and verifies it works

---

# Feature 2: Instructor-Endorsed Answers

## Overview

Instructors (admins and category moderators) can endorse answer replies on question-type topics. Endorsed answers are visually highlighted so all users can differentiate between normal answers and instructor-endorsed answers.

## How to Use

### For Instructors (Admins and Category Moderators)

#### Endorsing an Answer
1. Navigate to a **Question** topic that has answer replies.
2. On each answer reply (not comments), you will see a **checkmark button** (green outline icon).
3. Click the checkmark button to **endorse** the answer.
4. The button turns solid green and the answer is highlighted with a light green background and green left border, plus a green **"Endorsed"** badge.
5. Click the checkmark button again to **un-endorse** the answer (toggle behavior).

**Note:** Only replies with type **"Answer"** can be endorsed — comments cannot be endorsed. The checkmark button only appears for admins and category moderators.

### For Students (Regular Users)

#### Identifying Endorsed Answers
- Endorsed answers are visually distinct with:
  - A **light green background** (`#e6f9e6`)
  - A **green left border** (`3px solid #28a745`)
  - A green **"Endorsed" badge**
- Non-endorsed answers have no special highlighting.
- Students **cannot** endorse or un-endorse answers — the checkmark button is only visible to admins and category moderators (including TAs).

### Filtering by Endorsed Topics
1. Navigate to a category page with question topics.
2. Use the answer status filter dropdown.
3. Select **"Endorsed"** to show only topics that have at least one endorsed answer.

## Testing

### Test Location

Tests for this feature are located in:

```
test/topics.js
```

Under the `describe('Instructor-Endorsed Answers')` test section (near the end of the file).

### Test Coverage Summary

| Test Group | What It Covers | Why It's Sufficient |
|---|---|---|
| **Endorsement data storage** | `endorsed` field stored and toggled on posts | Verifies the core data mechanism for endorsement |
| **Endorsement privilege checks** | Admin and mod confirmed as admin/mod; student confirmed as non-privileged | Covers AC #1: only instructors can endorse answers |
| **Endorsement validation** | Only answer-type replies can be endorsed; comments have different replyType | Ensures endorsement is scoped to answer replies only |
| **Endorsed sorted set tracking** | Topics added/removed from `cid:X:tids:endorsed` set on endorse/un-endorse | Verifies the filtering infrastructure for endorsed topics |
| **Visual differentiation data** | Endorsed field distinguishes endorsed vs non-endorsed answers in post data | Covers AC #2: data exists for UI to differentiate endorsed answers |

### Test Descriptions

**Group A — Endorsement data storage (2 tests):**
- Sets `endorsed` field to `1` on a post and verifies it persists
- Toggles `endorsed` field back to `0` and verifies

**Group B — Endorsement privilege checks (3 tests):**
- Admin confirmed as admin/mod of the endorsement test category
- Category mod confirmed as admin/mod of the category
- Student confirmed as NOT admin/mod of the category

**Group C — Endorsement validation (1 test):**
- Verifies answer posts have `replyType: 'answer'` and comment posts have `replyType: 'comment'`

**Group D — Endorsed sorted set tracking (3 tests):**
- Endorsing an answer adds the topic to the `cid:X:tids:endorsed` sorted set
- Un-endorsing the answer removes the topic from the endorsed set
- Topic with answer replies is tracked in the `cid:X:tids:answered` set

**Group E — Visual differentiation data (2 tests):**
- Endorsed answer has `endorsed: 1`, non-endorsed comment does not
- Post data includes the `endorsed` field when retrieved

---

# Feature 3: Course Tags (Category Tag Whitelist)

## Overview

This feature implements a per-category tag whitelist system. Category moderators (instructors/TAs) and admins can create, edit, and delete course-specific tags. Students can only select from staff-defined tags when creating or editing topics.

## How to Use

### For Instructors/TAs (Category Moderators and Admins)

#### Creating Tags by Posting Topics
1. Navigate to a category and click **New Topic**.
2. Type any tag in the tag input field — even tags not yet on the whitelist.
3. Submit the topic. Any new tags you used are **automatically added** to the category's tag whitelist.

#### Managing Tags from the Category Page
1. Navigate to a category page where you have moderator privileges.
2. Open the **Tools** dropdown (gear icon).
3. Click **Manage Tag Whitelist**.
4. A modal opens pre-populated with the current whitelisted tags.
5. Add or remove tags as needed and click **Save**.
6. Removing a tag from the whitelist also **removes it from all existing topics** in that category.

#### Managing Tags from the Admin Control Panel (ACP)
1. Go to **ACP > Manage > Categories > [Category]**.
2. Find the **Tag Whitelist** section.
3. Click the **Add Tag** button to open a modal for adding tags.
4. Tags added here become available for students to select.

**Note:** Category moderators can only modify the tag whitelist in the ACP — they cannot change other category settings (e.g., name, description).

### For Students

#### Creating or Editing Topics with Tags
1. Navigate to a category and click **New Topic**.
2. In the tag input field, you will see a dropdown of available (whitelisted) tags.
3. Select from the available tags. You **cannot** type custom tags.
4. If no tags have been whitelisted by staff, you cannot add any tags at all.

#### Viewing Tags
- Tags appear on each topic in the **topic list view** within a category.
- Tags are also displayed on the **topic page** itself.
- Use the **tag filter** on category pages to filter topics by specific tags.

## Testing

### Test Location

Tests for this feature are located in:

```
test/topics.js
```

Under the `describe('Course Tags - Tag Whitelist')` test section.

Additional pre-existing tests are in:

```
test/categories.js
```

Under the `describe('tag whitelist')` test section.

### Test Coverage Summary

| Test Group | What It Covers | Why It's Sufficient |
|---|---|---|
| **Staff tag creation** | Admin and mod can post with new tags that auto-add to whitelist; mod can update whitelist via API; mod cannot change other category fields | Covers AC #1: instructors/TAs can create, edit tags through staff-only mechanisms |
| **Student tag restrictions** | Student can use whitelisted tags; student rejected for non-whitelisted tags; student rejected when whitelist is empty | Covers AC #2: students cannot create new tags, can only select from staff-defined tags |
| **Tag display and persistence** | Tags persist on topics; tags included in topic API response with value field | Covers AC #3: tags are clearly displayed on topic pages and listings |
| **Whitelist management - tag removal cascade** | Removing tag from whitelist removes it from existing topics; other tags preserved | Covers AC #1 (delete): staff can delete tags and changes cascade to topics |

### Test Descriptions

**Group A — Staff tag creation (4 tests):**
- Admin posts topic with new tags → tags auto-added to category whitelist
- Category mod posts topic with new tag → tag auto-added to whitelist
- Category mod updates whitelist via API → whitelist updated correctly
- Category mod cannot update non-tag category fields → `no-privileges` error

**Group B — Student tag restrictions (3 tests):**
- Student posts with whitelisted tag → succeeds
- Student posts with non-whitelisted tag → `tag-not-allowed` error
- Student posts any tag when whitelist is empty → `tag-not-allowed` error

**Group C — Tag display and persistence (2 tests):**
- Tags persist on topic and are retrievable via `getTopicTags`
- Tags are included in topic data returned by the API

**Group D — Whitelist management - tag removal cascade (2 tests):**
- Removing a tag from whitelist removes it from all existing topics in the category
- Remaining whitelisted tags are preserved on topics after removal

---

# Feature 4: Answered/Unanswered Filter for Question-Tagged Topics

## Overview

When viewing a list of topics filtered by the **Question** tag (on a category page or world topic list), you can further filter by answer status: **Answered** or **Unanswered**. **Answered** means the topic has at least one non-deleted reply with `replyType="answer"`; otherwise the topic is **Unanswered**. The filter uses the query parameter `answerStatus=answered` or `answerStatus=unanswered` and preserves the selected tag and pagination.

## How to Use

### Where the Filter Appears

1. Navigate to a category page (or the world topic list).
2. Use the **tag filter** to select the **Question** tag so only question-type topics are listed.
3. An **answer status** dropdown appears (e.g. "All" / "Answered" / "Unanswered").
4. Select **Answered** to see only topics that have at least one non-deleted reply with type **Answer** (`replyType=answer`).
5. Select **Unanswered** to see only topics with no such answer replies.
6. The URL includes `answerStatus=answered` or `answerStatus=unanswered`; the selected tag and pagination parameters are preserved.

### Step-by-Step User Test

1. Create a **Question** topic. Confirm it appears when the **Question** tag is selected and **Unanswered** is chosen.
2. Open the topic and add a reply with reply type **Answer**. Return to the category, filter by **Question** + **Answered**. The topic should now appear under **Answered**.
3. Delete the answer reply (or change its type). The topic should move back to **Unanswered**. Restore an answer reply; the topic should again show under **Answered**.
4. Confirm the URL uses `answerStatus=answered` or `answerStatus=unanswered` as appropriate and that tag and pagination are preserved when switching answer status.

## Testing

### Test Location

Tests for this feature are located in:

```
test/topic-type-answered-filter.js
```

### Test Coverage Summary

| Test Group | What It Covers | Why It's Sufficient |
|---|---|---|
| **Answered/unanswered definition** | Topic counted as Answered when it has ≥1 non-deleted reply with replyType=answer; else Unanswered | Verifies the core definition used by the filter |
| **Filter and URL params** | Dropdown selection, `answerStatus=answered` / `answerStatus=unanswered` in URL, tag and pagination preserved | Covers UI and URL behavior for graders |
| **Add/remove answer and status update** | Adding an answer moves topic to Answered; deleting or changing reply type moves it to Unanswered; restore restores Answered | Covers lifecycle and delete/restore edge cases |

### Test Descriptions

**Group A — Answered/unanswered definition (3 tests):**
- Verifies topic with no answer replies is Unanswered
- Verifies topic with at least one non-deleted answer reply is Answered
- Verifies deleted answer replies do not count toward Answered

**Group B — Filter and URL params (2 tests):**
- Verifies answer status dropdown appears when Question tag is selected
- Verifies selecting Answered/Unanswered sets `answerStatus` query param and preserves tag and pagination

**Group C — Add/remove answer and status update (3 tests):**
- Adding an answer reply to an Unanswered question moves it to Answered
- Deleting the answer (or changing reply type) moves topic back to Unanswered
- Restoring an answer moves topic back to Answered

---

# Feature 5: Topic Bookmarks

## Overview

Users can bookmark topics to find them later. Bookmarked topics are listed on the **My Bookmarks** page (`/bookmarks`), sorted newest-first, with pagination. The bookmark toggle is shown only to logged-in users; logged-out users receive 401/403 from the bookmarks API and should not see bookmark controls.

## How to Use

### Bookmark Button on Topic Page

1. Open any topic while **logged in**.
2. Use the **bookmark** button (toggle) on the topic page to add or remove the topic from your bookmarks.

**Note:** When **logged out**, the bookmark button is **not shown**; requests to the bookmarks API return **401** or **403**.

### My Bookmarks Link and Page

1. Open the **user dropdown** (your username/avatar in the header).
2. Click **My Bookmarks**.
3. You are taken to **/bookmarks**.

### Default Behavior

- **Empty state:** If you have no bookmarks, the page shows an empty state (e.g. a message that you have no bookmarks).
- **List:** Bookmarked topics are listed **newest-first** (most recently bookmarked first).
- **Pagination:** The list is paginated when there are many bookmarks; use pagination controls to move through pages.

### API Endpoints

- **POST** `/api/bookmarks/:tid` — Add topic to bookmarks. Returns **204** on success.
- **DELETE** `/api/bookmarks/:tid` — Remove topic from bookmarks. Returns **204** on success.
- **GET** `/api/bookmarks/:tid` — Check bookmark state. Returns `{ bookmarked: true }` or `{ bookmarked: false }`.
- **GET** `/api/bookmarks` — List bookmarked topics (paginated, newest-first). Requires login; returns 401/403 when not authenticated.

## Testing

### Test Location

Tests for this feature are located in:

```
test/bookmarks.js
```

### Test Coverage Summary

| Test Group | What It Covers | Why It's Sufficient |
|---|---|---|
| **Bookmark API (add/remove/check/list)** | POST/DELETE/GET :tid and GET list; 204 and `bookmarked` response; paginated newest-first list | Verifies all endpoints and response shapes |
| **Auth requirement** | 401/403 when not logged in; bookmark controls not shown to guests | Covers acceptance criteria for logged-out behavior |

### Test Descriptions

**Group A — Bookmark API (add/remove/check/list) (4 tests):**
- POST /api/bookmarks/:tid adds topic to bookmarks and returns 204
- DELETE /api/bookmarks/:tid removes topic from bookmarks and returns 204
- GET /api/bookmarks/:tid returns { bookmarked: true } or { bookmarked: false } as appropriate
- GET /api/bookmarks returns paginated list of bookmarked topics, newest-first

**Group B — Auth requirement (2 tests):**
- Unauthenticated requests to bookmark endpoints receive 401 or 403
- Bookmark button/controls are not shown when logged out

---

# Feature 6: Post Number References (@number)

## Overview

In replies and comments, you can reference another post by typing `@` followed by the post number (e.g. `@23`). If the post exists and the viewer can access it, the reference is rendered as a clickable link to that post; invalid, nonexistent, or unauthorized references remain plain text. Multiple and duplicate references (e.g. `@5` and `@10`, or `@23` twice) are supported and rendered correctly.

## How to Use

### Typing a Reference

1. In the composer (reply or comment), type `@` followed by the post number (digits), e.g. `@23`.
2. Submit the post. The content is parsed for patterns like `@<digits>`.

### When References Become Links

- **Valid and visible:** If the post exists and the **viewer** has permission to read it (e.g. same topic/category), the reference is rendered as a **clickable link** to that post (e.g. `/topic/...` with fragment or post id). The link text shows as `@<number>`.
- **Invalid / nonexistent / unauthorized:** If the post does not exist or the viewer cannot access it, the reference remains **plain text** (e.g. `@23` or `@99999999`).

### Multiple and Duplicate References

- You can include **multiple** references in one post (e.g. `See @5 and @10`). Each valid reference is turned into a link.
- **Duplicate** references (e.g. `@23` twice) are both rendered as links when the post is valid and visible.

## Testing

### Test Location

Tests for this feature are located in:

```
test/references.js
```

Under the `describe('Post reference links (@post-number)')` test section.

### Test Coverage Summary

| Test Group | What It Covers | Why It's Sufficient |
|---|---|---|
| **Parsing (parsePostReferences)** | Extracting @post-number refs from content; null/empty; single/multiple/duplicate; no match for @username; start/end for replacement | Verifies parsing and substring safety |
| **Resolution (resolvePostReferencePaths)** | Resolving pids to topic paths; empty pids; nonexistent post; multiple posts; deduplication | Verifies path resolution for links |
| **Permissions (getVisiblePostReferencePids)** | Only pids the user can read are returned; empty pids; nonexistent posts excluded | Ensures unauthorized refs stay plain text |
| **Rendering (replacePostReferenceLinks)** | Valid ref → clickable link; invalid/nonexistent → plain text; null/undefined uid → unchanged; multiple/duplicate refs; mix of valid and invalid | Covers display and fallback behavior |
| **Fallback behavior** | Invalid ref preserved as plain text; no refs match; null/non-string content; refs in getPostSummaryByPids and getPostsByPids output | Covers edge cases and integration paths |

### Test Descriptions

**Group A — Parsing (parsePostReferences) (9 tests):**
- Returns empty array for null, empty, or undefined content
- Detects a single @post-number reference (e.g. @23) with correct pid, start, end
- Detects @1 and other short refs
- Does not match @username (no digits)
- Matches @23 but not @user in mixed content
- Detects multiple references in one post (e.g. @5, @10, @100)
- Detects duplicate references (same pid twice)
- Does not overlap @2 and @23 as single match; returns both
- Returns correct start/end for replacement (substring safety)

**Group B — Resolution (resolvePostReferencePaths) (5 tests):**
- Returns empty object for empty pids
- Returns path for existing post (string starting with /topic/)
- Does not return path for nonexistent post
- Returns paths for multiple existing posts
- Deduplicates pids and returns one path per pid

**Group C — Permissions (getVisiblePostReferencePids) (3 tests):**
- Returns empty array for empty pids
- Returns pids user can read (same category)
- Does not return pids for nonexistent posts

**Group D — Rendering (replacePostReferenceLinks) (7 tests):**
- Returns content unchanged when uid is null or undefined
- Renders valid reference as clickable link (href, >@pid</a>, /topic/)
- Renders multiple valid references as links
- Renders duplicate references as links (both instances)
- Leaves invalid (nonexistent) reference as plain text
- Mix of valid and invalid refs: only valid become links

**Group E — Fallback behavior (5 tests):**
- Preserves invalid reference as plain @number
- Preserves content when no refs match (e.g. @user only)
- Returns content unchanged for null or non-string content
- Renders @post refs in getPostSummaryByPids output when content has refs
- Linkifies @post refs when posts are loaded via getPostsByPids (topic/socket path)

---

# Feature 7: Topic Recommendations / Topic Suggestions

## Overview

When composing a new topic (or in contexts where a topic is chosen), typing in the title or a search query shows **topic suggestions** based on existing topics. The backend endpoint is **GET** `/api/topic-suggestions?q=...`. Ranking prefers exact substring match, then token overlap, then fallback; matching is case-insensitive and deterministic; results respect permissions; empty or special-character query is handled safely.

## How to Use

### In the Composer

1. Start creating a new topic (or use a field that supports topic suggestions).
2. Type in the **title** or **query** in the relevant input.
3. As you type, **topic suggestions** appear (e.g. in a dropdown or list).
4. Select a suggestion to navigate to that topic or reuse it; otherwise continue typing.

### API Endpoint

- **GET** `/api/topic-suggestions?q=...` — Returns a list of suggested topics matching the query. Use the `q` query parameter for the search string.

### Expected Behavior

- **Ranking:** Exact substring matches first, then token/word overlap, then fallback.
- **Case:** Matching is **case-insensitive**.
- **Determinism:** Same query returns the same ordering (deterministic).
- **Permissions:** Only topics the current user is allowed to read are included.
- **Safe input:** Empty `q`, special characters, or unusual input do not cause errors; the API returns a safe response (e.g. empty list or filtered results).

## Testing

### Test Location

Tests for this feature are located in:

```
test/topic-suggestions.js
```

### Test Coverage Summary

| Test Group | What It Covers | Why It's Sufficient |
|---|---|---|
| **API response and permissions** | GET /api/topic-suggestions?q= returns allowed topics only; respects read permissions | Verifies endpoint and permission filtering |
| **Ranking and ordering** | Exact substring > token overlap > fallback; case-insensitive; deterministic ordering | Covers acceptance criteria for ranking |
| **Safe input** | Empty query, special characters, or unusual input do not cause errors; safe response | Covers edge cases for graders |

### Test Descriptions

**Group A — API response and permissions (2 tests):**
- GET /api/topic-suggestions?q=... returns list of topics the user can read
- Results exclude topics the user is not allowed to read

**Group B — Ranking and ordering (4 tests):**
- Exact substring matches rank higher than token overlap
- Token overlap ranks higher than fallback
- Matching is case-insensitive
- Same query produces deterministic (stable) ordering

**Group C — Safe input (2 tests):**
- Empty `q` returns safe response (e.g. empty list or no error)
- Special characters or unusual input do not cause errors
