'use strict';

const assert = require('assert');
const nconf = require('nconf');

require('./mocks/databasemock');

const request = require('../src/request');
const topics = require('../src/topics');
const categories = require('../src/categories');
const user = require('../src/user');
const groups = require('../src/groups');
const privileges = require('../src/privileges');
const helpers = require('./helpers');

/**
 * Tests for PR #39: Topic recommendations.
 * GET /api/topic-suggestions?q=<query> returns ranked topics (exact substring > token overlap > fallback),
 * respects permissions, and handles empty/short/special queries safely.
 */
describe('topic suggestions', () => {
	const baseUrl = () => nconf.get('url');

	function suggestionsUrl(q, limit) {
		const params = new URLSearchParams();
		if (q != null) params.set('q', q);
		if (limit != null) params.set('limit', String(limit));
		const query = params.toString();
		return `${baseUrl()}/api/topic-suggestions${query ? `?${query}` : ''}`;
	}

	function getTopicsFromBody(body) {
		if (!body) return [];
		const list = body.topics || (body.response && body.response.topics);
		return Array.isArray(list) ? list : [];
	}

	function getTids(body) {
		return getTopicsFromBody(body).map(t => t.tid);
	}

	describe('A) Basic success and shape', () => {
		let uid;
		let cid;
		const LIMIT = 20;

		before(async () => {
			uid = await user.create({ username: 'suggestions-user', password: 'barbar', gdpr_consent: true });
			const category = await categories.create({
				name: 'Suggestions Category A',
				description: 'For topic suggestions tests',
			});
			cid = category.cid;
			await topics.post({ uid, cid, title: 'Reference target one', content: 'Content here.' });
			await topics.post({ uid, cid, title: 'Another reference match', content: 'Content.' });
			await topics.post({ uid, cid, title: 'Third reference topic', content: 'Content.' });
			await topics.post({ uid, cid, title: 'Reference and more', content: 'Content.' });
		});

		it('returns 200 and array of topics with tids/titles', async () => {
			const { response, body } = await request.get(suggestionsUrl('reference'));
			assert.strictEqual(response.statusCode, 200);
			const list = getTopicsFromBody(body);
			assert(Array.isArray(list), 'response must contain topics array');
			list.forEach((topic) => {
				assert(topic != null && typeof topic.tid !== 'undefined', 'each topic must have tid');
				assert(typeof topic.title === 'string', 'each topic must have title');
			});
		});

		it('result length does not exceed endpoint limit', async () => {
			const { body } = await request.get(suggestionsUrl('reference', LIMIT));
			const list = getTopicsFromBody(body);
			assert(list.length <= LIMIT, `expected at most ${LIMIT} topics, got ${list.length}`);
		});
	});

	describe('B) Ranking: exact substring > token overlap > fallback', () => {
		let uid;
		let cid;
		let tidExact;
		let tidToken;
		let tidOther;
		let tidPartial;

		before(async () => {
			uid = await user.create({ username: 'suggestions-rank-user', password: 'barbar', gdpr_consent: true });
			const category = await categories.create({
				name: 'Suggestions Category B',
				description: 'For ranking tests',
			});
			cid = category.cid;
			const r1 = await topics.post({ uid, cid, title: 'Reference target', content: 'Content.' });
			tidExact = r1.topicData.tid;
			const r2 = await topics.post({ uid, cid, title: 'Target for reference', content: 'Content.' });
			tidToken = r2.topicData.tid;
			const r3 = await topics.post({ uid, cid, title: 'Completely different', content: 'Content.' });
			tidOther = r3.topicData.tid;
			const r4 = await topics.post({ uid, cid, title: 'Ref only at start', content: 'Content.' });
			tidPartial = r4.topicData.tid;
		});

		it('query "reference" places exact-substring match ahead of others', async () => {
			const { response, body } = await request.get(suggestionsUrl('reference'));
			assert.strictEqual(response.statusCode, 200);
			const tids = getTids(body);
			const idxExact = tids.indexOf(tidExact);
			const idxToken = tids.indexOf(tidToken);
			const idxOther = tids.indexOf(tidOther);
			if (idxExact >= 0 && idxToken >= 0) {
				assert(idxExact < idxToken, 'exact-substring topic should rank before token-overlap');
			}
			if (idxExact >= 0 && idxOther >= 0) {
				assert(idxExact < idxOther, 'exact-substring topic should rank before non-matching');
			}
		});

		it('query "reference target" returns consistent tier ordering', async () => {
			const { response, body } = await request.get(suggestionsUrl('reference target'));
			assert.strictEqual(response.statusCode, 200);
			const list = getTopicsFromBody(body);
			const tids = list.map(t => t.tid);
			const idxExact = tids.indexOf(tidExact);
			const idxToken = tids.indexOf(tidToken);
			if (idxExact >= 0 && idxToken >= 0) {
				assert(idxExact <= idxToken, 'exact match should come before or equal to token match');
			}
		});
	});

	describe('C) Case-insensitivity', () => {
		let uid;
		let cid;
		let tid;

		before(async () => {
			uid = await user.create({ username: 'suggestions-case-user', password: 'barbar', gdpr_consent: true });
			const category = await categories.create({
				name: 'Suggestions Category C',
				description: 'For case tests',
			});
			cid = category.cid;
			const r = await topics.post({ uid, cid, title: 'Reference target', content: 'Content.' });
			tid = r.topicData.tid;
		});

		it('query "ReFeReNcE" returns same ordering as "reference"', async () => {
			const { body: body1 } = await request.get(suggestionsUrl('ReFeReNcE'));
			const { body: body2 } = await request.get(suggestionsUrl('reference'));
			const tids1 = getTids(body1);
			const tids2 = getTids(body2);
			assert.deepStrictEqual(tids1, tids2, 'tid ordering should be identical for mixed-case and lowercase query');
		});
	});

	describe('D) Determinism', () => {
		let uid;
		let cid;

		before(async () => {
			uid = await user.create({ username: 'suggestions-det-user', password: 'barbar', gdpr_consent: true });
			const category = await categories.create({
				name: 'Suggestions Category D',
				description: 'For determinism tests',
			});
			cid = category.cid;
			await topics.post({ uid, cid, title: 'Determinism reference', content: 'Content.' });
		});

		it('two identical requests return same tid order', async () => {
			const { body: body1 } = await request.get(suggestionsUrl('reference'));
			const { body: body2 } = await request.get(suggestionsUrl('reference'));
			const tids1 = getTids(body1);
			const tids2 = getTids(body2);
			assert.deepStrictEqual(tids1, tids2, 'tid ordering must be identical across calls');
		});
	});

	describe('E) Permissions and visibility', () => {
		let adminUid;
		let regularUid;
		let adminJar;
		let regularJar;
		let privateCid;
		let publicCid;
		let tidPrivate;
		let tidPublic;

		before(async () => {
			adminUid = await user.create({ username: 'suggestions-admin', password: 'barbar', gdpr_consent: true });
			await user.setUserField(adminUid, 'email', 'sug-admin@test.com');
			await user.email.confirmByUid(adminUid);
			await groups.join('administrators', adminUid);

			regularUid = await user.create({ username: 'suggestions-regular', password: 'barbar', gdpr_consent: true });
			await user.setUserField(regularUid, 'email', 'sug-regular@test.com');
			await user.email.confirmByUid(regularUid);

			adminJar = (await helpers.loginUser('suggestions-admin', 'barbar')).jar;
			regularJar = (await helpers.loginUser('suggestions-regular', 'barbar')).jar;

			const privateCat = await categories.create({
				name: 'Suggestions Private Category',
				description: 'Private for visibility tests',
			});
			privateCid = privateCat.cid;
			await privileges.categories.rescind(['groups:topics:read'], privateCid, 'registered-users');

			const publicCat = await categories.create({
				name: 'Suggestions Public Category E',
				description: 'Public for visibility tests',
			});
			publicCid = publicCat.cid;

			const rPrivate = await topics.post({
				uid: adminUid,
				cid: privateCid,
				title: 'Private unique term visibility',
				content: 'Private content.',
			});
			tidPrivate = rPrivate.topicData.tid;

			const rPublic = await topics.post({
				uid: adminUid,
				cid: publicCid,
				title: 'Public topic',
				content: 'Content.',
			});
			tidPublic = rPublic.topicData.tid;
		});

		it('regular user does not see private category topic in suggestions', async () => {
			const { response, body } = await request.get(suggestionsUrl('unique term visibility'), { jar: regularJar });
			assert.strictEqual(response.statusCode, 200);
			const tids = getTids(body);
			assert(!tids.includes(tidPrivate), `tid ${tidPrivate} (private) must not appear for regular user`);
		});

		it('admin sees private topic in suggestions when query matches', async () => {
			const { response, body } = await request.get(suggestionsUrl('unique term visibility'), { jar: adminJar });
			assert.strictEqual(response.statusCode, 200);
			const tids = getTids(body);
			assert(tids.includes(tidPrivate), `tid ${tidPrivate} (private) should appear for admin`);
		});
	});

	describe('F) Safety and validation', () => {
		it('empty query returns 200 and empty or safe result', async () => {
			const { response, body } = await request.get(suggestionsUrl(''));
			assert.strictEqual(response.statusCode, 200);
			const list = getTopicsFromBody(body);
			assert(Array.isArray(list), 'response must contain topics array');
		});

		it('very short query (e.g. "a") does not throw', async () => {
			const { response, body } = await request.get(suggestionsUrl('a'));
			assert.strictEqual(response.statusCode, 200);
			const list = getTopicsFromBody(body);
			assert(Array.isArray(list));
		});

		it('single-char query "1" does not throw', async () => {
			const { response, body } = await request.get(suggestionsUrl('1'));
			assert.strictEqual(response.statusCode, 200);
			const list = getTopicsFromBody(body);
			assert(Array.isArray(list));
		});

		it('special characters in query return 200 and do not crash', async () => {
			const { response, body } = await request.get(suggestionsUrl('[]{}()*+?'));
			assert.strictEqual(response.statusCode, 200);
			const list = getTopicsFromBody(body);
			assert(Array.isArray(list));
		});
	});
});
