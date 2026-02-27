'use strict';

const assert = require('assert');
const nconf = require('nconf');

require('./mocks/databasemock');

const request = require('../src/request');
const search = require('../src/search');
const topics = require('../src/topics');
const categories = require('../src/categories');
const user = require('../src/user');

describe('topic suggestions API', () => {
	let originalSearch;
	let topicData;
	let postData;

	before(async () => {
		originalSearch = search.search;

		const uid = await user.create({ username: 'suggest-user' });
		const { cid } = await categories.create({
			name: 'Suggestion Category',
			description: 'For topic suggestions tests',
		});
		({ topicData, postData } = await topics.post({
			uid: uid,
			cid: cid,
			title: 'Suggestion Test Topic',
			content: 'First post content',
		}));

		const userData = await user.getUserFields(uid, ['uid', 'username', 'userslug', 'picture', 'status']);

		search.search = async function (data) {
			if (data.query === 'Sug') {
				return {
					posts: [{
						pid: postData.pid,
						user: userData,
						topic: {
							tid: topicData.tid,
							title: topicData.title,
							slug: topicData.slug,
							timestamp: postData.timestamp,
							teaserPid: topicData.teaserPid,
						},
					}],
					matchCount: 1,
					pageCount: 1,
				};
			}

			return {
				posts: [],
				matchCount: 0,
				pageCount: 1,
			};
		};
	});

	after(() => {
		search.search = originalSearch;
	});

	it('should return empty array when query is too short', async () => {
		const { body } = await request.get(`${nconf.get('url')}/api/topic-suggestions?query=ab`, {});
		assert.ok(body);
		assert.deepStrictEqual(body.topics, []);
	});

	it('should return topic suggestions for valid query', async () => {
		const { body } = await request.get(`${nconf.get('url')}/api/topic-suggestions?query=Sug`, {});
		assert.ok(body);
		assert.ok(Array.isArray(body.topics));
		assert.ok(body.topics.length >= 1);

		const topic = body.topics[0];
		assert.strictEqual(topic.tid, topicData.tid);
		assert.strictEqual(topic.title, topicData.title);
		assert.strictEqual(topic.slug, topicData.slug);
		assert.ok(topic.timestamp);
		assert.ok(topic.user);
	});

	it('should rank by exact substring > token overlap > fallback', async () => {
		const uid = await user.create({ username: 'rank-user' });
		const { cid } = await categories.create({
			name: 'Rank Category',
			description: 'For ranking tests',
		});
		const userData = await user.getUserFields(uid, ['uid', 'username', 'userslug', 'picture', 'status']);

		// Create 3 topics: one with exact "node bb", one with tokens only, one with single token
		const { topicData: t1, postData: p1 } = await topics.post({
			uid, cid, title: 'Node BB comparison', content: 'This is test content.',
		});
		const { topicData: t2, postData: p2 } = await topics.post({
			uid, cid, title: 'Node and BB tips', content: 'Sample topic body content.',
		});
		const { topicData: t3, postData: p3 } = await topics.post({
			uid, cid, title: 'Node only', content: 'Another post body here.',
		});

		// Mock search to return in reverse order of desired rank (token-only first, then exact, then single)
		search.search = async function (data) {
			if (data.query === 'node bb') {
				return {
					posts: [
						{
							pid: p3.pid,
							user: userData,
							topic: { tid: t3.tid, title: t3.title, slug: t3.slug, timestamp: p3.timestamp, teaserPid: t3.teaserPid },
						},
						{
							pid: p2.pid,
							user: userData,
							topic: { tid: t2.tid, title: t2.title, slug: t2.slug, timestamp: p2.timestamp, teaserPid: t2.teaserPid },
						},
						{
							pid: p1.pid,
							user: userData,
							topic: { tid: t1.tid, title: t1.title, slug: t1.slug, timestamp: p1.timestamp, teaserPid: t1.teaserPid },
						},
					],
					matchCount: 3,
					pageCount: 1,
				};
			}
			return { posts: [], matchCount: 0, pageCount: 1 };
		};

		const { body } = await request.get(`${nconf.get('url')}/api/topic-suggestions?query=node%20bb`, {});
		assert.ok(body && Array.isArray(body.topics));
		assert.strictEqual(body.topics.length, 3);

		// Exact substring "node bb" in "node bb comparison" -> first
		assert.strictEqual(body.topics[0].title, 'Node BB comparison');
		// Token overlap (node, bb) in "node and bb tips" -> second
		assert.strictEqual(body.topics[1].title, 'Node and BB tips');
		// Only "node" overlap in "node only" -> third
		assert.strictEqual(body.topics[2].title, 'Node only');
	});
});

