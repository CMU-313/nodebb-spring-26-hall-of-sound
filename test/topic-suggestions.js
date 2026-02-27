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
});

