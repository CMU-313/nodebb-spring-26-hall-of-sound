'use strict';

const assert = require('assert');

require('./mocks/databasemock');
const topics = require('../src/topics');
const posts = require('../src/posts');
const categories = require('../src/categories');
const privileges = require('../src/privileges');
const user = require('../src/user');

describe('Post reference links (@post-number)', () => {
	let authorUid;
	let viewerUid;
	let cid;
	let topicData;
	let mainPid;
	let replyPid;

	before(async () => {
		authorUid = await user.create({ username: 'refauthor' });
		viewerUid = await user.create({ username: 'refviewer' });
		({ cid } = await categories.create({
			name: 'Ref Test Category',
			description: 'For @post-number reference tests',
		}));
		const result = await topics.post({
			uid: authorUid,
			cid,
			title: 'Topic for reference tests',
			content: 'Main post content',
		});
		topicData = result.topicData;
		mainPid = result.postData.pid;
		const reply = await topics.reply({
			uid: authorUid,
			tid: topicData.tid,
			content: 'Reply content',
		});
		replyPid = reply.pid;
	});

	describe('parsing (parsePostReferences)', () => {
		it('should return empty array for null or empty content', () => {
			assert.deepStrictEqual(posts.parsePostReferences(null), []);
			assert.deepStrictEqual(posts.parsePostReferences(''), []);
			assert.deepStrictEqual(posts.parsePostReferences(undefined), []);
		});

		it('should detect a single @post-number reference', () => {
			const refs = posts.parsePostReferences('See @23 for details');
			assert.strictEqual(refs.length, 1);
			assert.strictEqual(refs[0].pid, 23);
			assert.strictEqual(refs[0].start, 4);
			assert.strictEqual(refs[0].end, 7);
		});

		it('should detect @1 and other short refs', () => {
			const refs = posts.parsePostReferences('@1');
			assert.strictEqual(refs.length, 1);
			assert.strictEqual(refs[0].pid, 1);
			assert.strictEqual(refs[0].start, 0);
			assert.strictEqual(refs[0].end, 2);
		});

		it('should not match @username (no digits)', () => {
			const refs = posts.parsePostReferences('Hello @username and @alice');
			assert.strictEqual(refs.length, 0);
		});

		it('should match @23 but not @user in mixed content', () => {
			const refs = posts.parsePostReferences('Ask @username or see @23');
			assert.strictEqual(refs.length, 1);
			assert.strictEqual(refs[0].pid, 23);
		});

		it('should detect multiple references in one post', () => {
			const refs = posts.parsePostReferences('Compare @5 and @10 and @100');
			assert.strictEqual(refs.length, 3);
			assert.strictEqual(refs[0].pid, 5);
			assert.strictEqual(refs[1].pid, 10);
			assert.strictEqual(refs[2].pid, 100);
			assert.ok(refs[0].start < refs[1].start && refs[1].start < refs[2].start);
		});

		it('should detect duplicate references (same pid twice)', () => {
			const refs = posts.parsePostReferences('@23 first and @23 again');
			assert.strictEqual(refs.length, 2);
			assert.strictEqual(refs[0].pid, 23);
			assert.strictEqual(refs[1].pid, 23);
			assert.strictEqual(refs[0].start, 0);
			assert.strictEqual(refs[1].start, 16);
		});

		it('should not overlap @2 and @23 as single match', () => {
			const refs = posts.parsePostReferences('@2 and @23');
			assert.strictEqual(refs.length, 2);
			assert.strictEqual(refs[0].pid, 2);
			assert.strictEqual(refs[1].pid, 23);
		});

		it('should return correct start/end for replacement (substring safety)', () => {
			const content = 'x@99y';
			const refs = posts.parsePostReferences(content);
			assert.strictEqual(refs.length, 1);
			assert.strictEqual(content.slice(refs[0].start, refs[0].end), '@99');
		});
	});

	describe('resolution (resolvePostReferencePaths)', () => {
		it('should return empty object for empty pids', async () => {
			const paths = await posts.resolvePostReferencePaths([], viewerUid);
			assert.deepStrictEqual(paths, {});
		});

		it('should return path for existing post', async () => {
			const paths = await posts.resolvePostReferencePaths([mainPid], viewerUid);
			assert.strictEqual(typeof paths[mainPid], 'string');
			assert.ok(paths[mainPid].startsWith('/topic/'));
		});

		it('should not return path for nonexistent post', async () => {
			const paths = await posts.resolvePostReferencePaths([99999999], viewerUid);
			assert.deepStrictEqual(paths, {});
		});

		it('should return paths for multiple existing posts', async () => {
			const paths = await posts.resolvePostReferencePaths([mainPid, replyPid], viewerUid);
			assert.strictEqual(Object.keys(paths).length, 2);
			assert.ok(paths[mainPid].startsWith('/topic/'));
			assert.ok(paths[replyPid].startsWith('/topic/'));
		});

		it('should deduplicate pids and return one path per pid', async () => {
			const paths = await posts.resolvePostReferencePaths([mainPid, mainPid, replyPid], viewerUid);
			assert.ok(paths[mainPid]);
			assert.ok(paths[replyPid]);
		});
	});

	describe('permissions (getVisiblePostReferencePids)', () => {
		it('should return empty array for empty pids', async () => {
			const visible = await posts.getVisiblePostReferencePids([], viewerUid);
			assert.deepStrictEqual(visible, []);
		});

		it('should return pids user can read (same category)', async () => {
			const visible = await posts.getVisiblePostReferencePids([mainPid, replyPid], viewerUid);
			assert.ok(visible.includes(mainPid));
			assert.ok(visible.includes(replyPid));
		});

		it('should not return pids for nonexistent posts', async () => {
			const visible = await posts.getVisiblePostReferencePids([99999999], viewerUid);
			assert.strictEqual(visible.length, 0);
		});
	});

	describe('rendering (replacePostReferenceLinks)', () => {
		it('should return content unchanged when uid is null', async () => {
			const content = `See @${mainPid} here`;
			const out = await posts.replacePostReferenceLinks(content, null);
			assert.strictEqual(out, content);
		});

		it('should return content unchanged when uid is undefined', async () => {
			const content = `See @${mainPid} here`;
			const out = await posts.replacePostReferenceLinks(content, undefined);
			assert.strictEqual(out, content);
		});

		it('should render valid reference as clickable link', async () => {
			const content = `See @${mainPid} for more`;
			const out = await posts.replacePostReferenceLinks(content, viewerUid);
			assert.ok(out.includes('<a href="'));
			assert.ok(out.includes(`>@${mainPid}</a>`));
			assert.ok(out.includes('/topic/'));
		});

		it('should render multiple valid references as links', async () => {
			const content = `@${mainPid} and @${replyPid}`;
			const out = await posts.replacePostReferenceLinks(content, viewerUid);
			assert.ok(out.includes(`>@${mainPid}</a>`));
			assert.ok(out.includes(`>@${replyPid}</a>`));
		});

		it('should render duplicate references as links', async () => {
			const content = `@${mainPid} same @${mainPid} again`;
			const out = await posts.replacePostReferenceLinks(content, viewerUid);
			const linkCount = (out.match(new RegExp(`>@${mainPid}</a>`, 'g')) || []).length;
			assert.strictEqual(linkCount, 2);
		});

		it('should leave invalid (nonexistent) reference as plain text', async () => {
			const content = 'See @99999999 here';
			const out = await posts.replacePostReferenceLinks(content, viewerUid);
			assert.strictEqual(out, 'See @99999999 here');
		});

		it('should mix valid and invalid refs (only valid become links)', async () => {
			const content = `@${mainPid} and @99999999`;
			const out = await posts.replacePostReferenceLinks(content, viewerUid);
			assert.ok(out.includes(`>@${mainPid}</a>`));
			// Invalid ref must remain as plain text (not inside an href)
			assert.ok(out.includes('@99999999'));
			assert.strictEqual((out.match(/<a href=/g) || []).length, 1);
		});
	});

	describe('fallback behavior', () => {
		it('should preserve invalid reference as plain @number', async () => {
			const content = 'Nonexistent @88888888';
			const out = await posts.replacePostReferenceLinks(content, viewerUid);
			assert.strictEqual(out, content);
		});

		it('should preserve content when no refs match', async () => {
			const content = 'No refs here @user only';
			const out = await posts.replacePostReferenceLinks(content, viewerUid);
			assert.strictEqual(out, content);
		});

		it('should return content unchanged for null or non-string content', async () => {
			assert.strictEqual(await posts.replacePostReferenceLinks(null, viewerUid), null);
			assert.strictEqual(await posts.replacePostReferenceLinks('', viewerUid), '');
		});

		it('should render @post refs in getPostSummaryByPids output when content has refs', async () => {
			const replyWithRef = await topics.reply({
				uid: authorUid,
				tid: topicData.tid,
				content: `See post @${mainPid} above`,
			});
			const summaries = await posts.getPostSummaryByPids([replyWithRef.pid], viewerUid, { stripTags: false });
			assert.strictEqual(summaries.length, 1);
			assert.ok(summaries[0].content.includes('<a href="'));
			assert.ok(summaries[0].content.includes(`>@${mainPid}</a>`));
		});
	});
});
