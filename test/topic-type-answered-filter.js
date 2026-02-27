'use strict';

const assert = require('assert');
const nconf = require('nconf');

require('./mocks/databasemock');

const request = require('../src/request');
const topics = require('../src/topics');
const categories = require('../src/categories');
const user = require('../src/user');
const posts = require('../src/posts');

/**
 * API-level tests for PR #23: filter answered/unanswered questions.
 * Answered = topic has ≥1 non-deleted reply with replyType === "answer".
 * Unanswered = otherwise.
 * Endpoint: GET /api/category/:cid/:slug with tag=Question and answerStatus=answered|unanswered.
 */
describe('topic-type answered/unanswered filter', () => {
	let uid;
	let cid;
	let slug;
	let tid1;
	let tid2;
	let tid3;
	let answerPid;

	before(async () => {
		uid = await user.create({ username: 'filter-user' });
		const category = await categories.create({
			name: 'Question Filter Category',
			description: 'For answer-status filter tests',
		});
		cid = category.cid;
		const fields = await categories.getCategoryFields(cid, ['slug']);
		slug = fields.slug || `${cid}/category-${cid}`;

		// T1: will have one reply with replyType=answer => Answered
		const r1 = await topics.post({
			uid,
			cid,
			title: 'Topic One Has Answer',
			content: 'This is test content for topic one.',
			topicType: 'question',
		});
		tid1 = r1.topicData.tid;
		const answerReply = await topics.reply({
			uid,
			tid: tid1,
			content: 'This is the accepted answer.',
			replyType: 'answer',
		});
		answerPid = answerReply.pid;

		// T2: one normal reply (no replyType=answer) => Unanswered
		const r2 = await topics.post({
			uid,
			cid,
			title: 'Topic Two Comment Only',
			content: 'This is test content for topic two.',
			topicType: 'question',
		});
		tid2 = r2.topicData.tid;
		await topics.reply({
			uid,
			tid: tid2,
			content: 'Just a comment reply.',
		});

		// T3: no replies => Unanswered
		const r3 = await topics.post({
			uid,
			cid,
			title: 'Topic Three No Replies',
			content: 'This is test content for topic three.',
			topicType: 'question',
		});
		tid3 = r3.topicData.tid;
	});

	function categoryUrl(query = '') {
		const slugEnc = encodeURIComponent(slug);
		const q = query ? `&${query}` : '';
		return `${nconf.get('url')}/api/category/${cid}/${slugEnc}?tag=Question${q}`;
	}

	function getTidsFromBody(body) {
		if (!body || !Array.isArray(body.topics)) {
			return [];
		}
		return body.topics.map(t => t.tid);
	}

	function assertTidsInclude(tids, expected) {
		const set = new Set(tids);
		expected.forEach(tid => assert(set.has(tid), `Expected tid ${tid} in response [${tids.join(',')}]`));
	}

	function assertTidsExclude(tids, unexpected) {
		const set = new Set(tids);
		unexpected.forEach(tid => assert(!set.has(tid), `Expected tid ${tid} not in response [${tids.join(',')}]`));
	}

	it('A) answerStatus=answered returns only topics with ≥1 non-deleted answer (T1 only)', async () => {
		const { response, body } = await request.get(categoryUrl('answerStatus=answered'));
		assert.strictEqual(response.statusCode, 200);
		const tids = getTidsFromBody(body);
		assertTidsInclude(tids, [tid1]);
		assertTidsExclude(tids, [tid2, tid3]);
	});

	it('B) answerStatus=unanswered returns T2 and T3, not T1', async () => {
		const { response, body } = await request.get(categoryUrl('answerStatus=unanswered'));
		assert.strictEqual(response.statusCode, 200);
		const tids = getTidsFromBody(body);
		assertTidsInclude(tids, [tid2, tid3]);
		assertTidsExclude(tids, [tid1]);
	});

	it('C) After soft-deleting the answer post, T1 disappears from answered and appears in unanswered', async () => {
		await posts.delete(answerPid, uid);

		const { response: resAnswered, body: bodyAnswered } = await request.get(categoryUrl('answerStatus=answered'));
		assert.strictEqual(resAnswered.statusCode, 200);
		const tidsAnswered = getTidsFromBody(bodyAnswered);
		assertTidsExclude(tidsAnswered, [tid1]);

		const { response: resUnanswered, body: bodyUnanswered } = await request.get(categoryUrl('answerStatus=unanswered'));
		assert.strictEqual(resUnanswered.statusCode, 200);
		const tidsUnanswered = getTidsFromBody(bodyUnanswered);
		assertTidsInclude(tidsUnanswered, [tid1, tid2, tid3]);
	});

	it('D) After restoring the answer post, T1 returns to answered', async () => {
		await posts.restore(answerPid, uid);

		const { response, body } = await request.get(categoryUrl('answerStatus=answered'));
		assert.strictEqual(response.statusCode, 200);
		const tids = getTidsFromBody(body);
		assertTidsInclude(tids, [tid1]);
		assertTidsExclude(tids, [tid2, tid3]);
	});

	it('E) Filter works with tag and pagination params (200, correctly filtered)', async () => {
		const { response, body } = await request.get(categoryUrl('answerStatus=answered&page=1'));
		assert.strictEqual(response.statusCode, 200);
		const tids = getTidsFromBody(body);
		assertTidsInclude(tids, [tid1]);
		assertTidsExclude(tids, [tid2, tid3]);

		const { response: res2, body: body2 } = await request.get(categoryUrl('answerStatus=unanswered&page=1'));
		assert.strictEqual(res2.statusCode, 200);
		const tids2 = getTidsFromBody(body2);
		assertTidsInclude(tids2, [tid2, tid3]);
		assertTidsExclude(tids2, [tid1]);
	});
});
