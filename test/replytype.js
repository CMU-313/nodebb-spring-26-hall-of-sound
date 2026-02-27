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
});
