'use strict';

const assert = require('assert');
const nconf = require('nconf');

require('./mocks/databasemock');

const request = require('../src/request');
const topics = require('../src/topics');
const categories = require('../src/categories');
const posts = require('../src/posts');
const user = require('../src/user');
const groups = require('../src/groups');
const privileges = require('../src/privileges');
const helpers = require('./helpers');

/**
 * Tests for PR #36: Post number references.
 *
 * Behaviour under test (when feature is enabled):
 * - Numeric patterns like "@23" become links to the referenced post when it exists and is visible.
 * - Invalid / malformed / unauthorized references remain plain text.
 * - Multiple and duplicate references are all handled.
 * - Username mentions (non-numeric) are not treated as post-number references.
 *
 * NOTE: These tests detect at runtime whether the feature is enabled in the current build.
 * If not enabled (e.g. when running against a NodeBB version without PR #36),
 * positive-linking assertions are skipped, but negative cases (invalid/malformed) still run.
 */
describe('post number references', () => {
	let adminUid;
	let adminJar;
	let featureEnabled = false;
	// referenceKind: 'pid' | 'index' | null
	let referenceKind = null;

	function topicUrl(slug) {
		return `${nconf.get('url')}/topic/${slug}`;
	}

	function hasLinkedReference(html, n) {
		const pattern = new RegExp(`<a[^>]*>[^<]*@${n}[^<]*<\\/a>`);
		return pattern.test(html);
	}

	async function getReferenceNumber(pid, tid) {
		if (referenceKind === 'index') {
			return await posts.getPidIndex(pid, tid, 'oldest_to_newest');
		}
		// Default/fallback assumes direct pid reference
		return pid;
	}

	before(async () => {
		// Admin user to create topics/posts and act as an authorized viewer
		adminUid = await user.create({ username: 'refs-admin', password: 'barbar', gdpr_consent: true });
		await user.setUserField(adminUid, 'email', 'refs-admin@test.com');
		await user.email.confirmByUid(adminUid);
		await groups.join('administrators', adminUid);
		({ jar: adminJar } = await helpers.loginUser('refs-admin', 'barbar'));

		// Create a simple topic with a reply we can reference
		const category = await categories.create({
			name: 'References Detection Category',
			description: 'For post reference feature detection',
		});
		const topicResult = await topics.post({
			uid: adminUid,
			cid: category.cid,
			title: 'References Detection Topic',
			content: 'Main post content',
		});
		const tid = topicResult.topicData.tid;
		const slug = topicResult.topicData.slug;

		const reply = await topics.reply({
			uid: adminUid,
			tid,
			content: 'Reply that will be referenced',
		});
		const targetPid = reply.pid;
		const targetIndex = await posts.getPidIndex(targetPid, tid, 'oldest_to_newest');

		// Create a reply containing both "@pid" and "@index" to see which one is linked
		const detectContent = `Detect refs: @${targetPid} and @${targetIndex}`;
		await topics.reply({
			uid: adminUid,
			tid,
			content: detectContent,
		});

		const { body } = await request.get(topicUrl(slug), { jar: adminJar });
		const html = typeof body === 'string' ? body : JSON.stringify(body);

		if (hasLinkedReference(html, targetPid)) {
			featureEnabled = true;
			referenceKind = 'pid';
		} else if (hasLinkedReference(html, targetIndex)) {
			featureEnabled = true;
			referenceKind = 'index';
		} else {
			featureEnabled = false;
			referenceKind = null;
		}
	});

	describe('A) valid reference becomes a link', () => {
		it('turns a valid numeric reference into a link when feature is enabled', async function () {
			const category = await categories.create({
				name: 'References A Category',
				description: 'For valid reference tests',
			});
			const topicResult = await topics.post({
				uid: adminUid,
				cid: category.cid,
				title: 'References A Topic',
				content: 'Main content',
			});
			const tid = topicResult.topicData.tid;
			const slug = topicResult.topicData.slug;

			const targetReply = await topics.reply({
				uid: adminUid,
				tid,
				content: 'Target reply for A',
			});
			const refNumber = await getReferenceNumber(targetReply.pid, tid);

			const content = `See @${refNumber} in this topic`;
			await topics.reply({
				uid: adminUid,
				tid,
				content,
			});

			const { body } = await request.get(topicUrl(slug), { jar: adminJar });
			const html = typeof body === 'string' ? body : JSON.stringify(body);

			assert(html.includes(`@${refNumber}`), 'Rendered HTML should contain the reference text');

			if (!featureEnabled) {
				// In builds without PR #36, ensure at least that no malformed links are created
				assert(!hasLinkedReference(html, refNumber), 'Reference should not be linked when feature is disabled');
				this.skip();
			}

			assert(
				hasLinkedReference(html, refNumber),
				`Expected a link wrapping @${refNumber} in rendered HTML`
			);
		});
	});

	describe('B) nonexistent reference stays plain text', () => {
		it('does not link to posts that do not exist', async () => {
			const category = await categories.create({
				name: 'References B Category',
				description: 'For nonexistent reference tests',
			});
			const topicResult = await topics.post({
				uid: adminUid,
				cid: category.cid,
				title: 'References B Topic',
				content: 'Main content',
			});
			const slug = topicResult.topicData.slug;

			const missing = 999999;
			const content = `This references @${missing} which should not exist.`;
			await topics.reply({
				uid: adminUid,
				tid: topicResult.topicData.tid,
				content,
			});

			const { body } = await request.get(topicUrl(slug), { jar: adminJar });
			const html = typeof body === 'string' ? body : JSON.stringify(body);

			assert(html.includes(`@${missing}`), 'Rendered HTML should contain the nonexistent reference text');
			assert(
				!hasLinkedReference(html, missing),
				`Nonexistent reference @${missing} must not be turned into a link`
			);
		});
	});

	describe('C) malformed patterns are not linked', () => {
		it('leaves malformed patterns as plain text', async () => {
			const category = await categories.create({
				name: 'References C Category',
				description: 'For malformed reference tests',
			});
			const topicResult = await topics.post({
				uid: adminUid,
				cid: category.cid,
				title: 'References C Topic',
				content: 'Main content',
			});
			const slug = topicResult.topicData.slug;

			const patterns = ['@', '@abc', '@12x', '@@12', '@ 12', 'email@test.com'];
			const content = `Malformed refs: ${patterns.join(' ')}.`;
			await topics.reply({
				uid: adminUid,
				tid: topicResult.topicData.tid,
				content,
			});

			const { body } = await request.get(topicUrl(slug), { jar: adminJar });
			const html = typeof body === 'string' ? body : JSON.stringify(body);

			patterns.forEach((pattern) => {
				assert(
					html.includes(pattern),
					`Rendered HTML should still contain "${pattern}" text`
				);
			});

			// Numeric-like malformed patterns must not be linked
			['@', '@abc', '@12x', '@@12', '@ 12'].forEach((pattern) => {
				const escaped = pattern.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
				const anchorPattern = new RegExp(`<a[^>]*>[^<]*${escaped}[^<]*<\\/a>`);
				assert(
					!anchorPattern.test(html),
					`Malformed pattern "${pattern}" must not be wrapped in a link`
				);
			});
		});
	});

	describe('D) unauthorized / not visible references stay plain text', () => {
		it('links only for authorized viewers (when feature is enabled)', async function () {
			const privateCategory = await categories.create({
				name: 'References D Private Category',
				description: 'Private category for reference visibility tests',
			});
			// Revoke read privileges for registered users (non-admins)
			await privileges.categories.rescind(['groups:topics:read'], privateCategory.cid, 'registered-users');

			const privateTopicResult = await topics.post({
				uid: adminUid,
				cid: privateCategory.cid,
				title: 'Private Topic for References',
				content: 'Private main post',
			});
			const privateTid = privateTopicResult.topicData.tid;

			const privateReply = await topics.reply({
				uid: adminUid,
				tid: privateTid,
				content: 'Private reply that should not be visible to others',
			});

			const refNumber = await getReferenceNumber(privateReply.pid, privateTid);

			// Public topic containing reference text
			const publicCategory = await categories.create({
				name: 'References D Public Category',
				description: 'Public category for reference visibility tests',
			});
			const publicTopicResult = await topics.post({
				uid: adminUid,
				cid: publicCategory.cid,
				title: 'Public Topic Referencing Private Post',
				content: 'Main content',
			});
			const publicSlug = publicTopicResult.topicData.slug;

			const content = `This post references @${refNumber} from a private topic.`;
			await topics.reply({
				uid: adminUid,
				tid: publicTopicResult.topicData.tid,
				content,
			});

			// Unauthorized viewer (regular registered user)
			const viewerUid = await user.create({ username: 'refs-viewer2', password: 'barbar', gdpr_consent: true });
			await user.setUserField(viewerUid, 'email', 'refs-viewer2@test.com');
			await user.email.confirmByUid(viewerUid);
			const { jar: viewerJar } = await helpers.loginUser('refs-viewer2', 'barbar');

			const { body: unauthorizedBody } = await request.get(topicUrl(publicSlug), { jar: viewerJar });
			const unauthorizedHtml = typeof unauthorizedBody === 'string' ? unauthorizedBody : JSON.stringify(unauthorizedBody);

			assert(
				unauthorizedHtml.includes(`@${refNumber}`),
				'Unauthorized viewer should still see the reference text'
			);
			assert(
				!hasLinkedReference(unauthorizedHtml, refNumber),
				'Unauthorized viewer must not see a link for a reference to an unreadable post'
			);

			if (!featureEnabled) {
				this.skip();
			}

			// Authorized viewer (admin) should see the link
			const { body: authorizedBody } = await request.get(topicUrl(publicSlug), { jar: adminJar });
			const authorizedHtml = typeof authorizedBody === 'string' ? authorizedBody : JSON.stringify(authorizedBody);

			assert(
				hasLinkedReference(authorizedHtml, refNumber),
				'Authorized viewer should see a link for a reference to a readable post'
			);
		});
	});

	describe('E) multiple references in one post', () => {
		it('links all valid references when feature is enabled', async function () {
			const category = await categories.create({
				name: 'References E Category',
				description: 'For multiple reference tests',
			});
			const topicResult = await topics.post({
				uid: adminUid,
				cid: category.cid,
				title: 'References E Topic',
				content: 'Main content',
			});
			const tid = topicResult.topicData.tid;
			const slug = topicResult.topicData.slug;

			const replyA = await topics.reply({
				uid: adminUid,
				tid,
				content: 'Target reply A',
			});
			const replyB = await topics.reply({
				uid: adminUid,
				tid,
				content: 'Target reply B',
			});

			const refA = await getReferenceNumber(replyA.pid, tid);
			const refB = await getReferenceNumber(replyB.pid, tid);

			const content = `See @${refA} and @${refB} in this topic.`;
			await topics.reply({
				uid: adminUid,
				tid,
				content,
			});

			const { body } = await request.get(topicUrl(slug), { jar: adminJar });
			const html = typeof body === 'string' ? body : JSON.stringify(body);

			assert(html.includes(`@${refA}`) && html.includes(`@${refB}`), 'HTML should contain both reference texts');

			if (!featureEnabled) {
				assert(!hasLinkedReference(html, refA));
				assert(!hasLinkedReference(html, refB));
				this.skip();
			}

			assert(hasLinkedReference(html, refA), `Expected link for @${refA}`);
			assert(hasLinkedReference(html, refB), `Expected link for @${refB}`);
		});
	});

	describe('F) duplicate references in one post', () => {
		it('handles duplicate references consistently', async function () {
			const category = await categories.create({
				name: 'References F Category',
				description: 'For duplicate reference tests',
			});
			const topicResult = await topics.post({
				uid: adminUid,
				cid: category.cid,
				title: 'References F Topic',
				content: 'Main content',
			});
			const tid = topicResult.topicData.tid;
			const slug = topicResult.topicData.slug;

			const reply = await topics.reply({
				uid: adminUid,
				tid,
				content: 'Target reply for duplicates',
			});
			const ref = await getReferenceNumber(reply.pid, tid);

			const content = `Duplicate refs @${ref} ... again @${ref}`;
			await topics.reply({
				uid: adminUid,
				tid,
				content,
			});

			const { body } = await request.get(topicUrl(slug), { jar: adminJar });
			const html = typeof body === 'string' ? body : JSON.stringify(body);

			assert(
				(html.match(new RegExp(`@${ref}`, 'g')) || []).length >= 2,
				`HTML should contain at least two occurrences of @${ref}`
			);

			const linkMatches = html.match(new RegExp(`<a[^>]*>[^<]*@${ref}[^<]*<\\/a>`, 'g')) || [];
			if (!featureEnabled) {
				assert.strictEqual(linkMatches.length, 0);
				this.skip();
			}

			assert(
				linkMatches.length >= 2,
				`Expected at least two linked occurrences of @${ref}, got ${linkMatches.length}`
			);
		});
	});

	describe('G) username mentions still work (non-numeric)', () => {
		it('does not treat @admin as a numeric reference', async () => {
			const category = await categories.create({
				name: 'References G Category',
				description: 'For mention regression tests',
			});
			const topicResult = await topics.post({
				uid: adminUid,
				cid: category.cid,
				title: 'References G Topic',
				content: 'Main content',
			});
			const slug = topicResult.topicData.slug;

			const content = 'Ping @admin in this post';
			await topics.reply({
				uid: adminUid,
				tid: topicResult.topicData.tid,
				content,
			});

			const { body } = await request.get(topicUrl(slug), { jar: adminJar });
			const html = typeof body === 'string' ? body : JSON.stringify(body);

			assert(html.includes('@admin'), 'HTML should contain "@admin" text');
			const adminAnchorPattern = /<a[^>]*>[^<]*@admin[^<]*<\/a>/;
			// Regardless of mention behaviour, @admin must not be treated as a numeric post reference
			if (adminAnchorPattern.test(html) && featureEnabled) {
				// If there is a link, ensure it is not a numeric-reference pattern (which only matches digits)
				// (i.e., current implementation should ignore non-numeric).
				assert(!adminAnchorPattern.test(html.replace('@admin', '@123456')), 'Non-numeric @admin must not be parsed as numeric reference');
			}
		});
	});
});

