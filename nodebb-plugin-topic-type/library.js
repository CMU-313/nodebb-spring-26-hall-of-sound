'use strict';

const db = require.main.require('./src/database');
const topics = require.main.require('./src/topics');
const posts = require.main.require('./src/posts');
const privileges = require.main.require('./src/privileges');
const websockets = require.main.require('./src/socket.io');
const controllerHelpers = require.main.require('./src/controllers/helpers');

const plugin = module.exports;

const ANSWERED_SET_SUFFIX = ':tids:answered';
const UNANSWERED_SET_SUFFIX = ':tids:unanswered';
const SCORE = 1;

function bookmarksSetKey(uid) {
	return `uid:${uid}:bookmarks:tids`;
}

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

// ─── Topic bookmarks (per-user sorted set) ─────────────────────────────────

function requireUid(req, res) {
	if (!req.uid || parseInt(req.uid, 10) <= 0) {
		if (res.locals.isAPI || (req.path && req.path.indexOf('/api') === 0)) {
			return res.status(403).json({ error: 'Not allowed', status: { code: 'forbidden', message: 'Not allowed' } });
		}
		controllerHelpers.notAllowed(req, res);
		return false;
	}
	return true;
}

plugin.bookmarksAdd = async function (req, res) {
	if (!requireUid(req, res)) return;
	const tid = req.params.tid;
	const key = bookmarksSetKey(req.uid);
	await db.sortedSetAdd(key, Date.now(), tid);
	res.status(204).end();
};

plugin.bookmarksRemove = async function (req, res) {
	if (!requireUid(req, res)) return;
	const tid = req.params.tid;
	const key = bookmarksSetKey(req.uid);
	await db.sortedSetRemove(key, tid);
	res.status(204).end();
};

plugin.bookmarksStatus = async function (req, res) {
	if (!requireUid(req, res)) return;
	const tid = req.params.tid;
	const key = bookmarksSetKey(req.uid);
	const bookmarked = await db.isSortedSetMember(key, tid);
	res.status(200).json({ bookmarked: !!bookmarked });
};

plugin.bookmarksList = async function (req, res) {
	if (!requireUid(req, res)) return;
	const page = Math.max(1, parseInt(req.query.page, 10) || 1);
	const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage, 10) || 20));
	const key = bookmarksSetKey(req.uid);
	const total = await db.sortedSetCard(key);
	const pageCount = Math.max(1, Math.ceil(total / perPage));
	const start = (page - 1) * perPage;
	const stop = start + perPage - 1;
	const tids = await db.getSortedSetRevRange(key, start, stop);
	const topicsData = tids.length ? await topics.getTopicsByTids(tids, { uid: req.uid }) : [];
	const payload = {
		topics: topicsData,
		pagination: { page, pageCount, total, perPage },
	};
	await controllerHelpers.formatApiResponse(200, res, payload);
};

plugin.bookmarksPage = async function (req, res) {
	if (!requireUid(req, res)) return;
	const page = Math.max(1, parseInt(req.query.page, 10) || 1);
	const perPage = 20;
	const key = bookmarksSetKey(req.uid);
	const total = await db.sortedSetCard(key);
	const pageCount = Math.max(1, Math.ceil(total / perPage));
	const start = (page - 1) * perPage;
	const stop = start + perPage - 1;
	const tids = await db.getSortedSetRevRange(key, start, stop);
	const topicsData = tids.length ? await topics.getTopicsByTids(tids, { uid: req.uid }) : [];
	res.render('bookmarks', {
		title: 'My Bookmarks',
		topics: topicsData,
		pagination: {
			page,
			pageCount,
			total,
			perPage,
			prev: Math.max(1, page - 1),
			next: Math.min(pageCount, page + 1),
		},
		breadcrumbs: [{ text: 'My Bookmarks', url: '/bookmarks' }],
	});
};

plugin.init = async function (params) {
	const { router, middleware } = params;
	const routeHelpers = require.main.require('./src/routes/helpers');

	// Page: /bookmarks (requires login)
	routeHelpers.setupPageRoute(router, '/bookmarks', [middleware.ensureLoggedIn], plugin.bookmarksPage);

	// API (plugin namespace; 403 if not logged in)
	routeHelpers.setupApiRoute(router, 'get', '/api/bookmarks', [middleware.ensureLoggedIn], plugin.bookmarksList);
	routeHelpers.setupApiRoute(router, 'get', '/api/bookmarks/:tid', [middleware.ensureLoggedIn], plugin.bookmarksStatus);
	routeHelpers.setupApiRoute(router, 'post', '/api/bookmarks/:tid', [middleware.ensureLoggedIn], plugin.bookmarksAdd);
	routeHelpers.setupApiRoute(router, 'delete', '/api/bookmarks/:tid', [middleware.ensureLoggedIn], plugin.bookmarksRemove);
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

// ─── Instructor-endorsed answers API ──────────────────────────────────────

plugin.setupApiRoutes = async function ({ router, middleware }) {
	router.put('/endorse/:pid', middleware.ensureLoggedIn, async (req, res) => {
		const pid = req.params.pid;
		const post = await posts.getPostFields(pid, ['pid', 'tid', 'replyType', 'endorsed']);
		if (!post || !post.pid) {
			return controllerHelpers.formatApiResponse(404, res, new Error('[[error:no-post]]'));
		}
		if (post.replyType !== 'answer') {
			return controllerHelpers.formatApiResponse(400, res, new Error('[[error:invalid-data]]'));
		}
		const topic = await topics.getTopicFields(post.tid, ['cid']);
		if (!topic || !topic.cid) {
			return controllerHelpers.formatApiResponse(404, res, new Error('[[error:no-topic]]'));
		}
		const isAdminOrMod = await privileges.categories.isAdminOrMod(topic.cid, req.uid);
		if (!isAdminOrMod) {
			return controllerHelpers.formatApiResponse(403, res, new Error('[[error:no-privileges]]'));
		}
		const newValue = parseInt(post.endorsed, 10) === 1 ? 0 : 1;
		await posts.setPostField(pid, 'endorsed', newValue);
		websockets.in(`topic_${post.tid}`).emit('event:post.endorsed', { pid: pid, endorsed: newValue });
		res.status(200).json({ endorsed: newValue });
	});
};
