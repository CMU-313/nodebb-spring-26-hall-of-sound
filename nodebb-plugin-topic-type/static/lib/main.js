'use strict';

/**
 * Client-side plugin for the Question/Note topic type selector and reply-type (Answer/Comment) for question topics.
 *
 * 1. Injects radio buttons (Question / Note) into the composer when creating a new topic.
 * 2. Reads the selected value and adds `topicType` to the API payload on submit.
 * 3. On question topic pages: injects Answer/Comment selector into quick reply (core quickreply.js reads it and sends replyType).
 * 4. On question topic pages: injects Answer/Comment selector into the main reply composer (filter:composer.submit sends replyType).
 * 5. On question topic pages: injects Answer/Comment badges into each post header (no .tpl changes), including new replies without refresh.
 * 6. On question topic pages: injects a reply filter dropdown (All / Answers / Comments) above the post list (no .tpl changes).
 * Note: For note topics, reply type is always comment and no selector is shown.
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

	// ── HTML for main composer reply-type selector (question topics only) ─
	var composerReplyTypeHTML = [
		'<div class="composer-reply-type d-flex align-items-center gap-2 flex-wrap" data-component="composer/reply-type-wrapper">',
		'  <span class="text-muted small">Post as</span>',
		'  <div component="composer/reply-type" class="btn-group btn-group-sm" role="group">',
		'    <input type="radio" class="btn-check" name="composerReplyType" id="composer-reply-type-answer" value="answer" autocomplete="off">',
		'    <label class="btn btn-outline-primary" for="composer-reply-type-answer">Answer</label>',
		'    <input type="radio" class="btn-check" name="composerReplyType" id="composer-reply-type-comment" value="comment" autocomplete="off" checked>',
		'    <label class="btn btn-outline-primary" for="composer-reply-type-comment">Comment</label>',
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

	// ── Inject Answer/Comment selector into main reply composer (question topics only) ─
	function injectComposerReplyTypeSelector(postContainer, composerData) {
		if (!composerData || composerData.action !== 'posts.reply') {
			return;
		}
		// Only show selector for question topics; note topics default to comment with no option
		if (typeof ajaxify === 'undefined' || !ajaxify.data || ajaxify.data.topicType !== 'question') {
			return;
		}
		if (postContainer.find('[data-component="composer/reply-type-wrapper"]').length) {
			return;
		}
		var titleEl = postContainer.find('[data-component="composer/title"]');
		if (titleEl.length) {
			titleEl.after(composerReplyTypeHTML);
		} else {
			var firstBody = postContainer.find('.card-body').first();
			if (firstBody.length) {
				firstBody.prepend(composerReplyTypeHTML);
			}
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

	// ── Inject Answer/Comment badge for a single post (by pid + replyType) ─
	function injectReplyTypeBadgeForPost(post) {
		if (typeof ajaxify === 'undefined' || !ajaxify.data || ajaxify.data.topicType !== 'question') {
			return;
		}
		if (!post || !post.pid || (post.replyType !== 'answer' && post.replyType !== 'comment')) {
			return;
		}

		var postEl = document.querySelector('[component="post"][data-pid="' + post.pid + '"]');
		if (!postEl) {
			return;
		}

		// Needed for reply filtering (All / Answers / Comments)
		postEl.setAttribute('data-reply-type', post.replyType);

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
	}

	// ── Inject Answer/Comment badges into post headers (question topics) ───
	function injectReplyTypeBadges(posts) {
		if (typeof ajaxify === 'undefined' || !ajaxify.data || ajaxify.data.topicType !== 'question') {
			return;
		}
		var list = Array.isArray(posts) ? posts : ajaxify.data.posts;
		if (!Array.isArray(list)) {
			return;
		}
		list.forEach(function (post) {
			injectReplyTypeBadgeForPost(post);
		});
	}


	// ── Instructor-endorsed answers ──────────────────────────────────────

	function getEndorseApiUrl(pid) {
		var base = (typeof config !== 'undefined' && config.relative_path) ? config.relative_path : '';
		return base + '/api/v3/plugins/endorse/' + pid;
	}

	function applyEndorsedHighlight(postEl) {
		if (!postEl) return;
		postEl.style.backgroundColor = '#e6f9e6';
		postEl.style.borderLeft = '3px solid #28a745';
		var header = postEl.querySelector('.post-header');
		if (!header) return;
		var firstRow = header.querySelector('.d-flex.gap-1.flex-wrap') || header.firstElementChild;
		if (!firstRow || firstRow.querySelector('[data-topic-type-endorsed-badge]')) return;
		var badge = document.createElement('span');
		badge.setAttribute('data-topic-type-endorsed-badge', '1');
		badge.className = 'badge rounded-1 me-1 bg-success';
		badge.textContent = 'Endorsed';
		var replyBadge = firstRow.querySelector('[data-topic-type-reply-badge]');
		if (replyBadge && replyBadge.nextSibling) {
			firstRow.insertBefore(badge, replyBadge.nextSibling);
		} else if (replyBadge) {
			firstRow.appendChild(badge);
		} else {
			firstRow.insertBefore(badge, firstRow.firstChild);
		}
	}

	function removeEndorsedHighlight(postEl) {
		if (!postEl) return;
		postEl.style.backgroundColor = '';
		postEl.style.borderLeft = '';
		var badge = postEl.querySelector('[data-topic-type-endorsed-badge]');
		if (badge) badge.remove();
	}

	function handleEndorseClick(pid, btn) {
		if (!pid || (btn && btn.disabled)) return;
		if (btn) btn.disabled = true;
		$.ajax({
			url: getEndorseApiUrl(pid),
			type: 'PUT',
			headers: { 'x-csrf-token': config.csrf_token },
			success: function (data) {
				var postEl = document.querySelector('[component="post"][data-pid="' + pid + '"]');
				if (data && data.endorsed) {
					applyEndorsedHighlight(postEl);
					if (btn) {
						btn.classList.remove('btn-outline-success');
						btn.classList.add('btn-success');
					}
				} else {
					removeEndorsedHighlight(postEl);
					if (btn) {
						btn.classList.remove('btn-success');
						btn.classList.add('btn-outline-success');
					}
				}
			},
			error: function () {
				require(['alerts'], function (alerts) {
					alerts.error('Could not update endorsement.');
				});
			},
			complete: function () {
				if (btn) btn.disabled = false;
			}
		});
	}

	function injectEndorseUI(postsList) {
		if (typeof ajaxify === 'undefined' || !ajaxify.data || ajaxify.data.topicType !== 'question') {
			return;
		}
		var isAdminOrMod = ajaxify.data.privileges && ajaxify.data.privileges.isAdminOrMod;
		var list = Array.isArray(postsList) ? postsList : ajaxify.data.posts;
		if (!Array.isArray(list)) return;

		list.forEach(function (post) {
			if (!post || !post.pid || post.replyType !== 'answer') return;
			var postEl = document.querySelector('[component="post"][data-pid="' + post.pid + '"]');
			if (!postEl) return;

			// Apply highlight for all users if endorsed
			if (parseInt(post.endorsed, 10) === 1) {
				applyEndorsedHighlight(postEl);
			}

			// Inject endorse button for admins/mods only
			if (!isAdminOrMod) return;
			var header = postEl.querySelector('.post-header');
			if (!header) return;
			var firstRow = header.querySelector('.d-flex.gap-1.flex-wrap') || header.firstElementChild;
			if (!firstRow || firstRow.querySelector('[data-endorse-btn]')) return;

			var btn = document.createElement('button');
			btn.setAttribute('data-endorse-btn', '1');
			btn.setAttribute('data-pid', post.pid);
			btn.type = 'button';
			btn.title = 'Endorse answer';
			btn.className = 'btn btn-sm ' + (parseInt(post.endorsed, 10) === 1 ? 'btn-success' : 'btn-outline-success');
			btn.innerHTML = '<i class="fa fa-check"></i>';
			btn.addEventListener('click', function (e) {
				e.preventDefault();
				e.stopPropagation();
				handleEndorseClick(post.pid, btn);
			});

			var endorsedBadge = firstRow.querySelector('[data-topic-type-endorsed-badge]');
			if (endorsedBadge && endorsedBadge.nextSibling) {
				firstRow.insertBefore(btn, endorsedBadge.nextSibling);
			} else if (endorsedBadge) {
				firstRow.appendChild(btn);
			} else {
				var replyBadge = firstRow.querySelector('[data-topic-type-reply-badge]');
				if (replyBadge && replyBadge.nextSibling) {
					firstRow.insertBefore(btn, replyBadge.nextSibling);
				} else {
					firstRow.appendChild(btn);
				}
			}
		});
	}

	// ── Reply filter (All / Answers / Comments) on question topic pages ───
	var REPLY_FILTER_KEY = 'topicReplyFilter';

	function getReplyFilter() {
		try {
			var tid = (typeof ajaxify !== 'undefined' && ajaxify.data && ajaxify.data.tid) ? String(ajaxify.data.tid) : '';
			var raw = tid ? (sessionStorage.getItem(REPLY_FILTER_KEY + '_' + tid) || 'all') : 'all';
			return (raw === 'answer' || raw === 'comment') ? raw : 'all';
		} catch (e) {
			return 'all';
		}
	}

	function setReplyFilter(value) {
		try {
			var tid = (typeof ajaxify !== 'undefined' && ajaxify.data && ajaxify.data.tid) ? String(ajaxify.data.tid) : '';
			if (tid) {
				sessionStorage.setItem(REPLY_FILTER_KEY + '_' + tid, value);
			}
		} catch (e) {}
	}

	function applyReplyFilter() {
		if (typeof ajaxify === 'undefined' || !ajaxify.data || ajaxify.data.topicType !== 'question') {
			return;
		}
		var filter = getReplyFilter();
		var topicEl = document.querySelector('[component="topic"]');
		if (!topicEl) {
			return;
		}
		var postEls = topicEl.querySelectorAll('[component="post"]');
		postEls.forEach(function (el, index) {
			var replyType = el.getAttribute('data-reply-type');
			var isFirstPost = index === 0;
			if (isFirstPost || !replyType) {
				el.style.display = '';
				el.style.visibility = '';
				return;
			}
			var show = filter === 'all' || replyType === filter;
			el.style.display = show ? '' : 'none';
			el.style.visibility = show ? '' : 'hidden';
		});
	}

	function injectReplyFilterDropdown() {
		if (typeof ajaxify === 'undefined' || !ajaxify.data || ajaxify.data.topicType !== 'question') {
			return;
		}
		var topicList = document.querySelector('[component="topic"]');
		if (!topicList || document.querySelector('[data-component="topic-type-reply-filter"]')) {
			return;
		}
		var current = getReplyFilter();
		var labels = { all: 'All', answer: 'Answers', comment: 'Comments' };
		var html = [
			'<div class="d-flex align-items-center gap-2 py-2" data-component="topic-type-reply-filter">',
			'  <label class="text-muted small mb-0">Filter replies</label>',
			'  <div class="btn-group btn-group-sm" role="group">',
			'    <select class="form-select form-select-sm" style="width: auto; min-width: 7rem;" data-reply-filter-select aria-label="Filter by reply type">',
			['all', 'answer', 'comment'].map(function (value) {
				var selected = current === value ? ' selected' : '';
				return '<option value="' + value + '"' + selected + '>' + (labels[value] || value) + '</option>';
			}).join(''),
			'    </select>',
			'  </div>',
			'</div>'
		].join('');
		topicList.insertAdjacentHTML('beforebegin', html);

		var selectEl = document.querySelector('[data-component="topic-type-reply-filter"] [data-reply-filter-select]');
		if (selectEl) {
			selectEl.addEventListener('change', function () {
				var val = selectEl.value;
				setReplyFilter(val);
				applyReplyFilter();
			});
		}
		applyReplyFilter();
	}

	// ── Run topic-page logic (quick reply selector + badges) ──────────────
	function onTopicPageReady() {
		if (typeof ajaxify === 'undefined' || !ajaxify.data || !ajaxify.data.tid) {
			return;
		}
		injectQuickReplyTypeSelector();
		injectReplyTypeBadges();
		injectEndorseUI();
		if (ajaxify.data.topicType === 'question') {
			injectReplyFilterDropdown();
		}
	}

	// ── Hook: composer loaded ────────────────────────────────────────────
	$(window).on('action:composer.loaded', function (_ev, data) {
		injectTopicTypeSelector(data.postContainer, data.composerData);
		injectComposerReplyTypeSelector(data.postContainer, data.composerData);
	});

	// ── Answered/Unanswered filter (always on category/world; selecting switches to Question + filter) ─
	function isCategoryOrWorldPage() {
		if (typeof ajaxify === 'undefined' || !ajaxify.data) {
			return false;
		}
		var t = ajaxify.data.template || {};
		return !!(t.category || t.world);
	}

	function getAnswerStatusFromUrl() {
		var match = (window.location.search || '').match(/[?&]answerStatus=([^&]+)/);
		var value = match ? decodeURIComponent(match[1]) : 'all';
		return ANSWER_STATUS_LABELS[value] ? value : 'all';
	}

	var ANSWER_STATUS_OPTIONS = [
		{ value: 'all', label: 'All' },
		{ value: 'answered', label: 'Answered' },
		{ value: 'unanswered', label: 'Unanswered' },
		{ value: 'endorsed', label: 'Endorsed' },
	];

	var ANSWER_STATUS_LABELS = ANSWER_STATUS_OPTIONS.reduce(function (acc, option) {
		acc[option.value] = option.label;
		return acc;
	}, {});

	/**
	 * Build URL for answer-status filter. Uses same codepath as tag filter: always sets tag=Question
	 * so topic type is "question". All = all questions (no answerStatus); Answered/Unanswered add that param.
	 */
	function buildUrlWithAnswerStatus(answerStatus) {
		var params = new URLSearchParams(window.location.search || '');
		params.set('tag', 'Question');
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
		if (!isCategoryOrWorldPage()) {
			return;
		}
		var container = document.querySelector('[component="category/controls"]');
		if (!container || container.querySelector('[data-component="topic-type-answer-status"]')) {
			return;
		}
		var current = getAnswerStatusFromUrl();
		var html = [
			'<div class="btn-group bottom-sheet" data-component="topic-type-answer-status">',
			'  <button class="btn btn-ghost btn-sm ff-secondary d-flex gap-2 align-items-center dropdown-toggle" data-bs-toggle="dropdown" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Filter by answer status">',
			'    <span class="d-none d-md-inline fw-semibold">' + ANSWER_STATUS_LABELS[current] + '</span>',
			'  </button>',
			'  <ul class="dropdown-menu p-1 text-sm" role="menu">',
			ANSWER_STATUS_OPTIONS.map(function (option) {
				var active = current === option.value ? ' active' : '';
				var href = buildUrlWithAnswerStatus(option.value);
				return '<li><a class="dropdown-item rounded-1' + active + '" href="' + href + '" data-answer-status="' + option.value + '" role="menuitem">' + option.label + '</a></li>';
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
			hooks.on('action:posts.loaded', function (payload) {
				// Use payload posts when present (new reply / load more) so reply-type badge appears without refresh
				var posts = payload && payload.posts;
				injectReplyTypeBadges(posts);
				injectEndorseUI(posts);
				applyReplyFilter();
			});
	
			hooks.on('action:quickreply.success', function (payload) {
				if (payload && payload.data && payload.data.pid) {
					setTimeout(function () {
						injectReplyTypeBadgeForPost(payload.data);
						applyReplyFilter();
					}, 0);
				} else {
					setTimeout(function () {
						injectReplyTypeBadges();
						applyReplyFilter();
					}, 0);
				}
			});
	
			// ── WebSocket: real-time endorsement updates ─────────────────────
		require(['forum/topic/events'], function () {
			if (typeof socket !== 'undefined' && socket.on) {
				socket.on('event:post.endorsed', function (data) {
					if (!data || !data.pid) return;
					var postEl = document.querySelector('[component="post"][data-pid="' + data.pid + '"]');
					if (!postEl) return;
					if (parseInt(data.endorsed, 10) === 1) {
						applyEndorsedHighlight(postEl);
					} else {
						removeEndorsedHighlight(postEl);
					}
					// Update endorse button state if present
					var btn = postEl.querySelector('[data-endorse-btn]');
					if (btn) {
						if (parseInt(data.endorsed, 10) === 1) {
							btn.classList.remove('btn-outline-success');
							btn.classList.add('btn-success');
						} else {
							btn.classList.remove('btn-success');
							btn.classList.add('btn-outline-success');
						}
					}
				});
			}
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
				if (hookData.action === 'posts.reply') {
					// Question topics: read from injected selector; note topics: no selector, default to comment
					// Match [component="..."] (theme convention), not [data-component="..."]
					var replyTypeEl = hookData.composerEl.find('[component="composer/reply-type"] input[name="composerReplyType"]:checked');
					hookData.composerData.replyType = replyTypeEl.length ? replyTypeEl.val() : 'comment';
				}
				return hookData;
			});
		});
	})();
