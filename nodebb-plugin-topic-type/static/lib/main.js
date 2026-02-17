'use strict';

/**
 * Client-side plugin for the Question/Note topic type selector and reply-type (Answer/Comment) for question topics.
 *
 * 1. Injects radio buttons (Question / Note) into the composer when creating a new topic.
 * 2. Reads the selected value and adds `topicType` to the API payload on submit.
 * 3. On question topic pages: injects Answer/Comment selector into quick reply (core quickreply.js reads it and sends replyType).
 * 4. On question topic pages: injects Answer/Comment badges into each post header (no .tpl changes).
 */
(function () {
	// ── HTML for the composer topic type radio group ─────────────────────
	var radioHTML = [
		'<div data-component="composer/topic-type" class="d-flex align-items-center gap-2 ms-2">',
		'  <div class="form-check">',
		'    <input class="form-check-input" type="radio" name="topic-type"',
		'           id="topic-type-question" value="question" checked>',
		'    <label class="form-check-label" for="topic-type-question">Question</label>',
		'  </div>',
		'  <div class="form-check">',
		'    <input class="form-check-input" type="radio" name="topic-type"',
		'           id="topic-type-note" value="note">',
		'    <label class="form-check-label" for="topic-type-note">Note</label>',
		'  </div>',
		'</div>',
	].join('\n');

	// ── HTML for quick reply Answer/Comment selector (question topics only) ─
	var quickReplyTypeHTML = [
		'<div class="quickreply-reply-type d-flex align-items-center gap-2 flex-wrap" data-component="topic/quickreply/reply-type-wrapper">',
		'  <span class="text-muted small">Post as</span>',
		'  <div component="topic/quickreply/reply-type" class="btn-group btn-group-sm" role="group">',
		'    <input type="radio" class="btn-check" name="replyType" id="quickreply-reply-type-answer" value="answer" autocomplete="off">',
		'    <label class="btn btn-outline-primary" for="quickreply-reply-type-answer">Answer</label>',
		'    <input type="radio" class="btn-check" name="replyType" id="quickreply-reply-type-comment" value="comment" autocomplete="off" checked>',
		'    <label class="btn btn-outline-primary" for="quickreply-reply-type-comment">Comment</label>',
		'  </div>',
		'</div>',
	].join('\n');

	// ── Inject topic type radio buttons when the composer opens ───────────
	function injectTopicTypeSelector(postContainer, composerData) {
		if (!composerData || composerData.action !== 'topics.post') {
			return;
		}
		if (postContainer.find('[data-component="composer/topic-type"]').length) {
			return;
		}
		var titleEl = postContainer.find('[data-component="composer/title"]');
		if (titleEl.length) {
			titleEl.after(radioHTML);
		}
	}

	// ── Inject Answer/Comment selector into quick reply (question topics) ─
	function injectQuickReplyTypeSelector() {
		if (typeof ajaxify === 'undefined' || !ajaxify.data || ajaxify.data.topicType !== 'question') {
			return;
		}
		var container = document.querySelector('[component="topic/quickreply/container"]');
		if (!container) {
			return;
		}
		if (container.querySelector('[data-component="topic/quickreply/reply-type-wrapper"]')) {
			return;
		}
		var messageDiv = container.querySelector('.quickreply-message');
		if (messageDiv && messageDiv.nextElementSibling) {
			messageDiv.insertAdjacentHTML('afterend', quickReplyTypeHTML);
		} else if (messageDiv) {
			messageDiv.insertAdjacentHTML('afterend', quickReplyTypeHTML);
		}
	}

	// ── Inject Answer/Comment badges into post headers (question topics) ───
	function injectReplyTypeBadges() {
		if (typeof ajaxify === 'undefined' || !ajaxify.data || ajaxify.data.topicType !== 'question') {
			return;
		}
		var posts = ajaxify.data.posts;
		if (!Array.isArray(posts)) {
			return;
		}
		posts.forEach(function (post) {
			if (!post || !post.pid || (post.replyType !== 'answer' && post.replyType !== 'comment')) {
				return;
			}
			var postEl = document.querySelector('[component="post"][data-pid="' + post.pid + '"]');
			if (!postEl) {
				return;
			}
			var header = postEl.querySelector('.post-header');
			if (!header) {
				return;
			}
			var firstRow = header.querySelector('.d-flex.gap-1.flex-wrap');
			if (!firstRow) {
				firstRow = header.firstElementChild;
			}
			if (!firstRow) {
				return;
			}
			if (firstRow.querySelector('[data-topic-type-reply-badge]')) {
				return;
			}
			var badge = document.createElement('span');
			badge.setAttribute('data-topic-type-reply-badge', '1');
			badge.className = 'badge rounded-1 me-1 ' + (post.replyType === 'answer' ? 'bg-success' : 'bg-secondary');
			badge.textContent = post.replyType === 'answer' ? 'Answer' : 'Comment';
			firstRow.insertBefore(badge, firstRow.firstChild);
		});
	}

	// ── Run topic-page logic (quick reply selector + badges) ──────────────
	function onTopicPageReady() {
		if (typeof ajaxify === 'undefined' || !ajaxify.data || !ajaxify.data.tid) {
			return;
		}
		injectQuickReplyTypeSelector();
		injectReplyTypeBadges();
	}

	// ── Hook: composer loaded ────────────────────────────────────────────
	$(window).on('action:composer.loaded', function (_ev, data) {
		injectTopicTypeSelector(data.postContainer, data.composerData);
	});

	// ── Answered/Unanswered filter dropdown (category question list only) ─
	function isCategoryQuestionsPage() {
		if (typeof ajaxify === 'undefined' || !ajaxify.data) {
			return false;
		}
		var t = ajaxify.data.template || {};
		if (!t.category && !t.world) {
			return false;
		}
		var qs = (window.location.search || '').slice(1);
		var tagLabel = (ajaxify.data.selectedTag && ajaxify.data.selectedTag.label) || '';
		var tagValue = (ajaxify.data.selectedTags && ajaxify.data.selectedTags[0]) || '';
		if (qs.indexOf('tag=Question') !== -1 || tagLabel === 'Question' || tagValue === 'Question') {
			return true;
		}
		return false;
	}

	function getAnswerStatusFromUrl() {
		var match = (window.location.search || '').match(/[?&]answerStatus=([^&]+)/);
		return match ? decodeURIComponent(match[1]) : 'all';
	}

	function buildUrlWithAnswerStatus(answerStatus) {
		var params = new URLSearchParams(window.location.search || '');
		if (answerStatus === 'all') {
			params.delete('answerStatus');
		} else {
			params.set('answerStatus', answerStatus);
		}
		params.delete('page');
		params.set('page', '1');
		var query = params.toString();
		var base = window.location.pathname || '';
		return query ? base + '?' + query : base;
	}

	function injectAnswerStatusDropdown() {
		if (!isCategoryQuestionsPage()) {
			return;
		}
		var container = document.querySelector('[component="category/controls"]');
		if (!container || container.querySelector('[data-component="topic-type-answer-status"]')) {
			return;
		}
		var current = getAnswerStatusFromUrl();
		var labels = { all: 'All', answered: 'Answered', unanswered: 'Unanswered' };
		var html = [
			'<div class="btn-group bottom-sheet" data-component="topic-type-answer-status">',
			'  <button class="btn btn-ghost btn-sm ff-secondary d-flex gap-2 align-items-center dropdown-toggle" data-bs-toggle="dropdown" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Filter by answer status">',
			'    <span class="d-none d-md-inline fw-semibold">' + (labels[current] || 'All') + '</span>',
			'  </button>',
			'  <ul class="dropdown-menu p-1 text-sm" role="menu">',
			['all', 'answered', 'unanswered'].map(function (value) {
				var active = current === value ? ' active' : '';
				var href = buildUrlWithAnswerStatus(value);
				return '<li><a class="dropdown-item rounded-1' + active + '" href="' + href + '" data-answer-status="' + value + '" role="menuitem">' + labels[value] + '</a></li>';
			}).join(''),
			'  </ul>',
			'</div>'
		].join('');
		container.insertAdjacentHTML('afterbegin', html);

		container.querySelectorAll('[data-component="topic-type-answer-status"] [data-answer-status]').forEach(function (link) {
			link.addEventListener('click', function (e) {
				e.preventDefault();
				var val = link.getAttribute('data-answer-status');
				ajaxify.go(buildUrlWithAnswerStatus(val));
			});
		});
	}

	// ── Topic bookmarks: button on topic page ───────────────────────────
	function getApiBase() {
		var base = (typeof config !== 'undefined' && config.relative_path) ? config.relative_path : '';
		return base + '/api/bookmarks';
	}

	function injectBookmarkButton() {
		if (typeof ajaxify === 'undefined' || !ajaxify.data || !ajaxify.data.tid) return;
		if (!ajaxify.data.template || !ajaxify.data.template.topic) return;
		if (!app.user.uid || parseInt(app.user.uid, 10) <= 0) return;
		var container = document.querySelector('[component="topic/watch"]');
		if (!container || document.querySelector('[data-component="topic-type-bookmark"]')) return;
		var tid = ajaxify.data.tid;
		var api = getApiBase();
		var html = '<button type="button" class="btn btn-ghost btn-sm ff-secondary d-flex gap-2 align-items-center topic-type-bookmark-btn" data-component="topic-type-bookmark" data-tid="' + tid + '" title="Bookmark topic" aria-label="Bookmark topic">' +
			'<i class="fa fa-bookmark-o topic-type-bookmark-icon" aria-hidden="true"></i></button>';
		container.insertAdjacentHTML('afterend', html);
		var btn = document.querySelector('[data-component="topic-type-bookmark"][data-tid="' + tid + '"]');
		var icon = btn ? btn.querySelector('.topic-type-bookmark-icon') : null;
		function setState(bookmarked) {
			if (!icon) return;
			icon.className = bookmarked ? 'fa fa-bookmark topic-type-bookmark-icon text-primary' : 'fa fa-bookmark-o topic-type-bookmark-icon';
		}
		function toggle() {
			if (!btn || btn.disabled) return;
			var isCurrentlyBookmarked = icon && icon.classList.contains('fa-bookmark');
			var method = isCurrentlyBookmarked ? 'DELETE' : 'POST';
			btn.disabled = true;
			$.ajax({
				url: api + '/' + tid,
				type: method,
				headers: { 'x-csrf-token': config.csrf_token },
				success: function () {
					setState(!isCurrentlyBookmarked);
				},
				error: function () {
					require(['alerts'], function (alerts) {
						alerts.error('Could not update bookmark.');
					});
				},
				complete: function () {
					btn.disabled = false;
				}
			});
		}
		$.get(api + '/' + tid).then(function (data) {
			if (data && typeof data.bookmarked !== 'undefined') setState(data.bookmarked);
		}).fail(function () {
			setState(false);
		});
		if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); toggle(); });
	}

	// ── Hook: topic page loaded (inject reply-type selector + badges) ────
	$(window).on('action:ajaxify.end', function () {
		onTopicPageReady();
		injectAnswerStatusDropdown();
		injectBookmarkButton();
	});

	// ── Hook: new posts added (e.g. nested replies, new post) ─────────────
	require(['hooks'], function (hooks) {
		hooks.on('action:posts.loaded', function () {
			injectReplyTypeBadges();
		});
		hooks.on('action:quickreply.success', function () {
			setTimeout(injectReplyTypeBadges, 0);
		});

		hooks.on('filter:composer.submit', function (hookData) {
			if (hookData.action === 'topics.post') {
				var selected = hookData.composerEl
					.find('input[name="topic-type"]:checked')
					.val();
				if (selected) {
					hookData.composerData.topicType = selected;
				}
			}
			return hookData;
		});
	});
})();
