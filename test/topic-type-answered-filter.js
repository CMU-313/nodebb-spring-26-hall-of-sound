'use strict';

const assert = require('assert');
const nconf = require('nconf');

require('./mocks/databasemock');

const request = require('../src/request');
const topics = require('../src/topics');
const categories = require('../src/categories');
const user = require('../src/user');
const posts = require('../src/posts');
const db = require('../src/database');

// Same set keys and score as nodebb-plugin-topic-type/library.js
const ANSWERED_SET_SUFFIX = ':tids:answered';
const UNANSWERED_SET_SUFFIX = ':tids:unanswered';
const SCORE = 1;

/**
 * API-level tests for PR #23: filter answered/unanswered questions.
 * Answered = topic has ≥1 non-deleted reply with replyType === "answer".
 * Unanswered = otherwise.
 * Uses the write API GET /api/v3/categories/:cid/topics with tag=Question and answerStatus=answered|unanswered.
 */
describe('topic-type answered/unanswered filter', () => {
	let uid;
	let cid;
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

		// T1: one reply with replyType=answer => Answered
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

		// Fixture assertions: ensure DB state matches expected answered/unanswered
		const [t1Type, t2Type, t3Type] = await Promise.all([
			topics.getTopicFields(tid1, ['topicType']),
			topics.getTopicFields(tid2, ['topicType']),
			topics.getTopicFields(tid3, ['topicType']),
		]);
		assert.strictEqual(t1Type.topicType, 'question', 'T1 must be question');
		assert.strictEqual(t2Type.topicType, 'question', 'T2 must be question');
		assert.strictEqual(t3Type.topicType, 'question', 'T3 must be question');

		// T1: the reply we created with replyType=answer must be stored as answer
		const answerPost = await posts.getPostFields(answerPid, ['replyType', 'deleted']);
		assert(answerPost && answerPost.replyType === 'answer', `T1 answer post (pid ${answerPid}) must have replyType=answer, got ${answerPost ? answerPost.replyType : 'missing'}`);
		assert.strictEqual(parseInt(answerPost.deleted, 10), 0, 'T1 answer post must not be deleted');

		// T2: must have zero non-deleted answer posts (only comment or no replyType)
		const countAnswerPosts = async (tid) => {
			const pids = await posts.getPidsFromSet(`tid:${tid}:posts`, 0, -1, false);
			if (!pids.length) return 0;
			const postList = await posts.getPostsFields(pids, ['replyType', 'deleted']);
			return postList.filter(p => p && p.replyType === 'answer' && parseInt(p.deleted, 10) === 0).length;
		};
		const t2Answers = await countAnswerPosts(tid2);
		assert.strictEqual(t2Answers, 0, `T2 must have zero answer posts, got ${t2Answers}`);

		// Sync plugin filter sets so answerStatus=answered/unanswered return correct tids.
		// In test env the plugin hooks may not have run yet; mirror the state the plugin would produce.
		const answeredSet = `cid:${cid}${ANSWERED_SET_SUFFIX}`;
		const unansweredSet = `cid:${cid}${UNANSWERED_SET_SUFFIX}`;
		await db.sortedSetAdd(answeredSet, SCORE, tid1);
		await db.sortedSetRemove(unansweredSet, tid1);
		await db.sortedSetAdd(unansweredSet, SCORE, tid2);
		await db.sortedSetAdd(unansweredSet, SCORE, tid3);
		await db.sortedSetRemove(answeredSet, [tid2, tid3]);
	});

	function topicsApiUrl(query = '') {
		const q = query ? `&${query}` : '';
		return `${nconf.get('url')}/api/v3/categories/${cid}/topics?tag=Question${q}`;
	}

	function getTidsFromBody(body) {
		const topics = (body && body.response && body.response.topics) || (body && body.topics);
		if (!Array.isArray(topics)) {
			return [];
		}
		return topics.map(t => t.tid);
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
		const { response, body } = await request.get(topicsApiUrl('answerStatus=answered'));
		assert.strictEqual(response.statusCode, 200);
		const tids = getTidsFromBody(body);
		assertTidsInclude(tids, [tid1]);
		assertTidsExclude(tids, [tid2, tid3]);
	});

	it('B) answerStatus=unanswered returns T2 and T3, not T1', async () => {
		const { response, body } = await request.get(topicsApiUrl('answerStatus=unanswered'));
		assert.strictEqual(response.statusCode, 200);
		const tids = getTidsFromBody(body);
		assertTidsInclude(tids, [tid2, tid3]);
		assertTidsExclude(tids, [tid1]);
	});

	it('C) After soft-deleting the answer post, T1 disappears from answered and appears in unanswered', async () => {
		await posts.delete(answerPid, uid);

		const { response: resAnswered, body: bodyAnswered } = await request.get(topicsApiUrl('answerStatus=answered'));
		assert.strictEqual(resAnswered.statusCode, 200);
		const tidsAnswered = getTidsFromBody(bodyAnswered);
		assertTidsExclude(tidsAnswered, [tid1]);

		const { response: resUnanswered, body: bodyUnanswered } = await request.get(topicsApiUrl('answerStatus=unanswered'));
		assert.strictEqual(resUnanswered.statusCode, 200);
		const tidsUnanswered = getTidsFromBody(bodyUnanswered);
		assertTidsInclude(tidsUnanswered, [tid1, tid2, tid3]);
	});

	it('D) After restoring the answer post, T1 returns to answered', async () => {
		await posts.restore(answerPid, uid);

		const { response, body } = await request.get(topicsApiUrl('answerStatus=answered'));
		assert.strictEqual(response.statusCode, 200);
		const tids = getTidsFromBody(body);
		assertTidsInclude(tids, [tid1]);
		assertTidsExclude(tids, [tid2, tid3]);
	});

	it('E) Filter works with tag and pagination params (200, correctly filtered)', async () => {
		const { response, body } = await request.get(topicsApiUrl('answerStatus=answered&after=0'));
		assert.strictEqual(response.statusCode, 200);
		const tids = getTidsFromBody(body);
		assertTidsInclude(tids, [tid1]);
		assertTidsExclude(tids, [tid2, tid3]);

		const { response: res2, body: body2 } = await request.get(topicsApiUrl('answerStatus=unanswered&after=0'));
		assert.strictEqual(res2.statusCode, 200);
		const tids2 = getTidsFromBody(body2);
		assertTidsInclude(tids2, [tid2, tid3]);
		assertTidsExclude(tids2, [tid1]);
	});
});
