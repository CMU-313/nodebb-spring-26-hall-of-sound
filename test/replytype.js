'use strict';

const assert = require('assert');

const db = require('./mocks/databasemock');
const topics = require('../src/topics');
const posts = require('../src/posts');
const categories = require('../src/categories');
const User = require('../src/user');
const groups = require('../src/groups');

describe('Reply type', () => {
	let adminUid;
	let fooUid;
	let cid;
	let questionTid;
	let regularTid;

	before(async () => {
		adminUid = await User.create({ username: 'replytype-admin', password: '123456' });
		fooUid = await User.create({ username: 'replytype-foo' });
		await groups.join('administrators', adminUid);

		const category = await categories.create({
			name: 'Reply Type Test Category',
			description: 'Category for replyType tests',
		});
		cid = category.cid;

		const questionResult = await topics.post({
			uid: adminUid,
			cid,
			title: 'A question topic',
			content: 'What is the answer?',
			topicType: 'question',
		});
		questionTid = questionResult.topicData.tid;

		const regularResult = await topics.post({
			uid: adminUid,
			cid,
			title: 'A regular topic',
			content: 'Just a note.',
		});
		regularTid = regularResult.topicData.tid;
	});

	describe('question topic replies', () => {
		it('should store replyType "answer" when replying with replyType answer', async () => {
			const result = await topics.reply({
				uid: fooUid,
				tid: questionTid,
				content: 'This is the answer.',
				replyType: 'answer',
			});
			assert.ok(result && result.pid);
			const stored = await posts.getPostField(result.pid, 'replyType');
			assert.strictEqual(stored, 'answer');
		});

		it('should store replyType "comment" when replying with replyType comment', async () => {
			const result = await topics.reply({
				uid: fooUid,
				tid: questionTid,
				content: 'This is a comment.',
				replyType: 'comment',
			});
			assert.ok(result && result.pid);
			const stored = await posts.getPostField(result.pid, 'replyType');
			assert.strictEqual(stored, 'comment');
		});

		it('should default to "comment" when replyType is omitted on question topic', async () => {
			const result = await topics.reply({
				uid: fooUid,
				tid: questionTid,
				content: 'Reply without replyType.',
			});
			assert.ok(result && result.pid);
			const stored = await posts.getPostField(result.pid, 'replyType');
			assert.strictEqual(stored, 'comment');
		});

		it('should accept replyType in different case and normalize to lowercase', async () => {
			const result = await topics.reply({
				uid: fooUid,
				tid: questionTid,
				content: 'Answer with uppercase.',
				replyType: 'ANSWER',
			});
			assert.ok(result && result.pid);
			const stored = await posts.getPostField(result.pid, 'replyType');
			assert.strictEqual(stored, 'answer');
		});

		it('should reject invalid replyType on question topic', async () => {
			await assert.rejects(
				topics.reply({
					uid: fooUid,
					tid: questionTid,
					content: 'Invalid reply type.',
					replyType: 'invalid',
				}),
				{ message: '[[error:invalid-reply-type]]' }
			);
		});
	});

	describe('regular (non-question) topic replies', () => {
		it('should not store replyType when replying to regular topic with replyType', async () => {
			const result = await topics.reply({
				uid: fooUid,
				tid: regularTid,
				content: 'Reply with replyType on regular topic.',
				replyType: 'answer',
			});
			assert.ok(result && result.pid);
			const stored = await posts.getPostField(result.pid, 'replyType');
			assert.strictEqual(stored, null);
		});
	});

	describe('API / post summary', () => {
		it('should include replyType in post data when present', async () => {
			const result = await topics.reply({
				uid: fooUid,
				tid: questionTid,
				content: 'Answer for summary check.',
				replyType: 'answer',
			});
			const summary = await posts.getPostSummaryByPids([result.pid], fooUid, {});
			assert.ok(Array.isArray(summary) && summary.length === 1);
			assert.strictEqual(summary[0].replyType, 'answer');
		});
	});

	describe('filter by replyType (answers/comments)', () => {
		let filterTopicTid;
		let filterTopicPosts;

		/**
		 * Filter posts by reply type (mirrors client logic in nodebb-plugin-topic-type).
		 * First post (main) is always included; other posts are included when
		 * filter === 'all' || post.replyType === filter.
		 * @param {Array} postsList - List of posts with replyType (main post has none)
		 * @param {'all'|'answer'|'comment'} filter - Filter value
		 * @returns {Array} Filtered posts
		 */
		function filterPostsByReplyType(postsList, filter) {
			return postsList.filter((post, index) => {
				const isFirstPost = index === 0;
				const replyType = post.replyType || null;
				if (isFirstPost || !replyType) {
					return true;
				}
				return filter === 'all' || replyType === filter;
			});
		}

		before(async () => {
			const result = await topics.post({
				uid: adminUid,
				cid,
				title: 'Filter test question',
				content: 'Main post for filter tests.',
				topicType: 'question',
			});
			filterTopicTid = result.topicData.tid;

			await topics.reply({ uid: fooUid, tid: filterTopicTid, content: 'First answer.', replyType: 'answer' });
			await topics.reply({ uid: fooUid, tid: filterTopicTid, content: 'Second answer.', replyType: 'answer' });
			await topics.reply({ uid: fooUid, tid: filterTopicTid, content: 'First comment.', replyType: 'comment' });
			await topics.reply({ uid: fooUid, tid: filterTopicTid, content: 'Second comment.', replyType: 'comment' });

			const topicData = await topics.getTopicData(filterTopicTid);
			filterTopicPosts = await topics.getTopicPosts(
				topicData,
				`tid:${filterTopicTid}:posts`,
				0,
				-1,
				adminUid,
				false
			);
		});

		it('should return all posts when filter is "all"', () => {
			const filtered = filterPostsByReplyType(filterTopicPosts, 'all');
			assert.strictEqual(filtered.length, 5, 'should have main post + 4 replies');
			assert.strictEqual(filtered.length, filterTopicPosts.length);
		});

		it('should return only main post and answers when filter is "answer"', () => {
			const filtered = filterPostsByReplyType(filterTopicPosts, 'answer');
			assert.strictEqual(filtered.length, 3, 'main post + 2 answers');
			assert.ok(filtered.every((p, i) => i === 0 || p.replyType === 'answer'));
			const answers = filtered.filter(p => p.replyType === 'answer');
			assert.strictEqual(answers.length, 2);
		});

		it('should return only main post and comments when filter is "comment"', () => {
			const filtered = filterPostsByReplyType(filterTopicPosts, 'comment');
			assert.strictEqual(filtered.length, 3, 'main post + 2 comments');
			assert.ok(filtered.every((p, i) => i === 0 || p.replyType === 'comment'));
			const comments = filtered.filter(p => p.replyType === 'comment');
			assert.strictEqual(comments.length, 2);
		});

		it('should always include first post (main) regardless of filter', () => {
			const mainPid = filterTopicPosts[0] && filterTopicPosts[0].pid;
			assert.ok(mainPid);
			for (const filter of ['all', 'answer', 'comment']) {
				const filtered = filterPostsByReplyType(filterTopicPosts, filter);
				assert.ok(filtered.length >= 1);
				assert.strictEqual(filtered[0].pid, mainPid);
				assert.ok(!filtered[0].replyType || filtered[0].replyType === undefined);
			}
		});

		it('should exclude answers when filter is "comment" and vice versa', () => {
			const byAnswer = filterPostsByReplyType(filterTopicPosts, 'answer');
			const byComment = filterPostsByReplyType(filterTopicPosts, 'comment');
			const answerPids = new Set(byAnswer.filter(p => p.replyType === 'answer').map(p => p.pid));
			const commentPids = new Set(byComment.filter(p => p.replyType === 'comment').map(p => p.pid));
			assert.strictEqual(answerPids.size, 2);
			assert.strictEqual(commentPids.size, 2);
			for (const pid of answerPids) {
				assert.ok(!commentPids.has(pid), 'answer pid should not appear in comment filter');
			}
			for (const pid of commentPids) {
				assert.ok(!answerPids.has(pid), 'comment pid should not appear in answer filter');
			}
		});
	});
});
