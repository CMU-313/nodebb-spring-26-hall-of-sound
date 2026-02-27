# User Guide

---

# Feature 1: Question/Note Topic Type

## Overview

This feature allows users to classify topics as either **Question** or **Note** when creating them. Question topics allows for additional features like answer/comment reply types, instructor endorsement, and filtering by answered/unanswered/endorsed status.

## Setup (Development Environment)

1. **Install and activate the local plugins:**
   ```bash
   ./setup-plugins.sh
   ```
   This installs the `nodebb-plugin-topic-type` plugin and activates it in NodeBB. You only need to run this once after cloning or after a fresh `npm install`.

2. **Build and restart:**
   ```bash
   ./nodebb build && ./nodebb restart
   ```

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

## Setup (Development Environment)

1. **Install and activate the local plugins:**
   ```bash
   ./setup-plugins.sh
   ```
   This installs the `nodebb-plugin-topic-type` plugin which provides the endorsement API. You only need to run this once after cloning or after a fresh `npm install`.

2. **Build and restart:**
   ```bash
   ./nodebb build && ./nodebb restart
   ```

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
