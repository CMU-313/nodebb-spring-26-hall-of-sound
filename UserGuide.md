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

# Feature 4: Answer/Comment Reply Type

## Overview

On **Question** topics, users can classify each reply as either an **Answer** or a **Comment**. The reply type is chosen when posting (quick reply or main composer) and is shown as a badge on each reply. Only **Answer** replies can be endorsed by instructors; comments cannot be endorsed. On **Note** topics, replies do not have this choice and are treated as comments.

## How to Use

### Replying with Answer or Comment (Question Topics)

1. Open a **Question** topic (identified by the **Question** tag).
2. When replying, you will see a **"Post as"** control with two options: **Answer** and **Comment**.
3. **Quick reply** (at the bottom of the topic): Select **Answer** or **Comment** before typing and submitting. **Comment** is selected by default.
4. **Main reply composer** (click **Reply** to open the full composer): Use the same **Post as** radio group — choose **Answer** or **Comment** (default **Comment**), then write and submit.

Your choice is stored with the post and displayed as a green **"Answer"** or gray **"Comment"** badge next to the reply.

### Default Behavior

- If you do not change the selector, your reply is saved as a **Comment**.
- On **Note** topics, the Answer/Comment selector is not shown; all replies are treated as comments.

### Identifying Reply Types

- Each reply on a question topic shows a badge: **Answer** (green) or **Comment** (gray).
- Endorsement is only available on **Answer** replies — instructors use the checkmark on answers to endorse them.

## Testing

### Test Location

All automated tests for this feature are located in:

```
test/replytype.js
```

Under the `describe('Reply type')` block. Reply-type storage and API behavior are in `describe('question topic replies')`, `describe('regular (non-question) topic replies')`, and `describe('API / post summary')`. Filtering tests are in `describe('filter by replyType (answers/comments)')` (see Feature 5).

### Test Coverage Summary

| Test Group | What It Covers | Why It's Sufficient |
|---|---|---|
| **Question topic replies** | Storing `answer`/`comment`, default to comment, case normalization, rejection of invalid replyType | Covers users selecting Answer or Comment when replying and validation |
| **Regular topic replies** | replyType not stored when replying to non-question topics | Ensures reply type only applies on question topics |
| **API / post summary** | replyType included in post summary data | Ensures UI can display Answer/Comment badges from API |

### Test Descriptions

**Group A — Question topic replies (5 tests):**
- Stores replyType `"answer"` when replying with replyType answer
- Stores replyType `"comment"` when replying with replyType comment
- Defaults to `"comment"` when replyType is omitted on a question topic
- Accepts replyType in different case and normalizes to lowercase (e.g. `"ANSWER"` → `"answer"`)
- Rejects invalid replyType on question topic with `[[error:invalid-reply-type]]`

**Group B — Regular (non-question) topic replies (1 test):**
- Does not store replyType when replying to a regular topic even if replyType is sent (stored value is null)

**Group C — API / post summary (1 test):**
- replyType is included in post data when present (e.g. in getPostSummaryByPids result)

---

# Feature 5: Filtering by Answers/Comments/All Replies

## Overview

On **Question** topic pages, a filter dropdown above the post list lets you view **All** replies, only **Answers**, or only **Comments**. The main post (first post) is always shown; the filter only affects which replies are displayed. This makes it easier to focus on direct answers or on discussion comments.

## How to Use

### Using the Reply Filter

1. Open a **Question** topic that has both answer and comment replies.
2. Above the list of posts, find the **reply filter** dropdown (e.g. labeled **"Filter by reply type"**).
3. Choose one of:
   - **All** — show the main post and all replies (default).
   - **Answers** — show the main post and only replies marked as **Answer**.
   - **Comments** — show the main post and only replies marked as **Comment**.
4. The topic view updates immediately to show only the selected type of replies; the main post always remains visible.

### Where the Filter Appears

- The filter is only present on **Question** topic pages. It is not shown on **Note** topics or on categories.

## Testing

### Test Location

Tests for this feature are located in:

```
test/replytype.js
```

Under the `describe('filter by replyType (answers/comments)')` section within `describe('Reply type')`.

### Test Coverage Summary

| Test Group | What It Covers | Why It's Sufficient |
|---|---|---|
| **Filter "all"** | All posts (main + all replies) returned when filter is "all" | Covers default view |
| **Filter "answer"** | Only main post and answer-type replies when filter is "answer" | Covers Answers filter behavior |
| **Filter "comment"** | Only main post and comment-type replies when filter is "comment" | Covers Comments filter behavior |
| **Main post always included** | First post included for every filter value; main post has no replyType | Ensures topic context is always visible |
| **Mutual exclusion** | Answer pids do not appear in comment filter; comment pids do not appear in answer filter | Ensures filters correctly separate answers and comments |

### Test Descriptions

**Group A — Filter "all" (1 test):**
- Returns all posts (main post + 4 replies) when filter is `"all"`; count matches full topic posts

**Group B — Filter "answer" (1 test):**
- Returns only main post and answers when filter is `"answer"` (e.g. main + 2 answers); every reply has replyType `"answer"`

**Group C — Filter "comment" (1 test):**
- Returns only main post and comments when filter is `"comment"` (e.g. main + 2 comments); every reply has replyType `"comment"`

**Group D — Main post always included (1 test):**
- For each filter value (`"all"`, `"answer"`, `"comment"`), filtered list has at least one post; first post is always the main post (same pid) and has no replyType

**Group E — Mutual exclusion (1 test):**
- Answer pids do not appear in the comment-filtered list; comment pids do not appear in the answer-filtered list
