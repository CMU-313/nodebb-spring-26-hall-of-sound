'use strict';

const db = require.main.require('./src/database');
const topics = require.main.require('./src/topics');

const plugin = module.exports;

const ANSWERED_SET_SUFFIX = ':tids:answered';
const UNANSWERED_SET_SUFFIX = ':tids:unanswered';
const SCORE = 1;

/**
 * Check whether the topic has any non-deleted answer posts (replyType === 'answer')
 * and update cid:${cid}:tids:answered and cid:${cid}:tids:unanswered accordingly.
 * Only affects question topics.
 * @param {number|string} tid - Topic id
 */
async function recomputeTopicAnswerStatus(tid) {
	const topic = await topics.getTopicFields(tid, ['cid', 'topicType']);
	if (!topic || topic.topicType !== 'question') {
		return;
	}
	const cid = topic.cid;
	const answeredSet = `cid:${cid}${ANSWERED_SET_SUFFIX}`;
	const unansweredSet = `cid:${cid}${UNANSWERED_SET_SUFFIX}`;

	const pids = await db.getSortedSetRange(`tid:${tid}:posts`, 0, -1);
	if (!pids.length) {
		await db.sortedSetRemove([answeredSet, unansweredSet], tid);
		return;
	}
	const keys = pids.map(pid => `post:${pid}`);
	const postData = await db.getObjectsFields(keys, ['replyType', 'deleted']);
	const hasAnswer = postData.some(
		p => p && p.replyType === 'answer' && parseInt(p.deleted, 10) !== 1
	);

	if (hasAnswer) {
		await db.sortedSetAdd(answeredSet, SCORE, tid);
		await db.sortedSetRemove(unansweredSet, tid);
	} else {
		await db.sortedSetRemove(answeredSet, tid);
		await db.sortedSetAdd(unansweredSet, SCORE, tid);
	}
}

plugin.init = async function () {
	// Client-side topic type and reply-type UI is in static/lib/main.js.
	// Answered/unanswered sets and filter hooks are below.
};

// ─── Topic list filter (pagination + count) ───────────────────────────────

plugin.filterCategoryTopicsPrepare = async function (data) {
	if (data.query && (data.query.answerStatus === 'answered' || data.query.answerStatus === 'unanswered')) {
		data.answerStatus = data.query.answerStatus;
	}
	return data;
};

plugin.filterCategoriesBuildTopicsSortedSet = async function (payload) {
	const data = payload.data || payload;
	const answerStatus = data.answerStatus || (data.query && data.query.answerStatus);
	if (answerStatus !== 'answered' && answerStatus !== 'unanswered') {
		return payload;
	}
	const cid = data.cid;
	const currentSet = payload.set;
	const sets = Array.isArray(currentSet) ? [...currentSet] : [currentSet];
	const filterSet = answerStatus === 'answered'
		? `cid:${cid}${ANSWERED_SET_SUFFIX}`
		: `cid:${cid}${UNANSWERED_SET_SUFFIX}`;
	sets.push(filterSet);
	return { ...payload, set: sets.length > 1 ? sets : sets[0] };
};

// ─── Maintain answered/unanswered sets ────────────────────────────────────

plugin.onTopicSave = async function (payload) {
	const topic = payload.topic;
	if (!topic || topic.topicType !== 'question') {
		return;
	}
	const cid = topic.cid;
	const tid = topic.tid;
	await db.sortedSetAdd(`cid:${cid}${UNANSWERED_SET_SUFFIX}`, SCORE, tid);
};

plugin.onPostSave = async function (payload) {
	const post = payload.post;
	if (!post || post.replyType !== 'answer') {
		return;
	}
	const topic = await topics.getTopicFields(post.tid, ['cid', 'topicType']);
	if (!topic || topic.topicType !== 'question') {
		return;
	}
	const cid = topic.cid;
	const tid = post.tid;
	await db.sortedSetAdd(`cid:${cid}${ANSWERED_SET_SUFFIX}`, SCORE, tid);
	await db.sortedSetRemove(`cid:${cid}${UNANSWERED_SET_SUFFIX}`, tid);
};

plugin.onPostEdit = async function (payload) {
	const post = payload.post;
	if (!post || !post.tid) {
		return;
	}
	await recomputeTopicAnswerStatus(post.tid);
};

plugin.onPostDelete = async function (payload) {
	const post = payload.post;
	if (!post || !post.tid) {
		return;
	}
	await recomputeTopicAnswerStatus(post.tid);
};

plugin.onPostRestore = async function (payload) {
	const post = payload.post;
	if (!post || !post.tid) {
		return;
	}
	await recomputeTopicAnswerStatus(post.tid);
};

plugin.onPostsPurge = async function (payload) {
	const postsData = payload.posts;
	if (!Array.isArray(postsData) || !postsData.length) {
		return;
	}
	const tids = [...new Set(postsData.map(p => p.tid).filter(Boolean))];
	for (const tid of tids) {
		await recomputeTopicAnswerStatus(tid);
	}
};
