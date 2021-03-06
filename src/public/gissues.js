var repos = [];
var issues;
var loadedIssues;
var minSentinel = { gissue: { order: 0 }};
var maxSentinel = { gissue: { order: 100 }};

function getQueryParam(name) {
	name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
	var regexS = "[\\?&]" + name + "=([^&#]*)";
	var regex = new RegExp(regexS);
	var results = regex.exec(window.location.href);
	return results === null ? undefined : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function parseOption(option) {
	options[option] = getQueryParam(option);
	if (options[option]) {
		$('#' + option).val(options[option]);
	}
}

function parseOptions() {
	options.repo = getQueryParam('repo');
	parseOption('labels');
	parseOption('assignee');
	parseOption('mentioned');
	parseOption('milestone');
}

function error(message, severity) {
	$('.glive').hide();
	$('#errorContainer').removeClass('error warning').addClass(severity || 'error');
	$('#errorMessage').html(message);
	$('#gerror').show();
}

function clearError() {
	$('#gerror').hide();
	$('.glive').show();
}

function createIssueElement(issueId) {
	var issue = issues[issueId];

	var labels = '';
	for (var i in issue.labels) {
		var label = issue.labels[i];
		// http://particletree.com/notebook/calculating-color-contrast-for-legible-text/
		var color = parseInt('0x' + label.color) > (0xffffff / 2) ? 'black' : 'white';
		labels += '<span class="label gissueLabel" style="background-color: ' + label.color + '; color: ' + color + '">'
			+ label.name
			+ '</span>';
	}

	var assignee = issue.assignee && issue.assignee.login ? '<span class="label notice gissueLabel" style="color: black">@' + issue.assignee.login + '</span>' : '';
		
	var size = issue.gissue ? '<span class="label size gissueLabel" style="color: black">size: ' + issue.gissue.size + '</span>' : '';

	var html = 
		'<div data-id="' + issueId + '" class="span4 gnote">'
			+ '<a href="' + issue.html_url + '">#' + issue.number.toString() + '</a>'
			+ ' ' + issue.title
			+ labels
			+ assignee
			+ size
		+ '</div>';
	
	return $(html); 
}

function updateIssues(issuesToUpdate) {
	for (var i in issuesToUpdate) {
		var issue = issuesToUpdate[i];
		var gissue = '@gissues:' + JSON.stringify(issue.gissue);
		var entity = {};
		var oldGissueIndex = issue.body.lastIndexOf('@gissues:{');
		if (oldGissueIndex === -1) {
			entity.body = issue.body + '\r\n' + gissue;
		}
		else {
			var oldGissueEndIndex = issue.body.indexOf('}', oldGissueIndex);
			if (oldGissueEndIndex === -1) {
				entity.body = issue.body + '\r\n' + gissue;
			}
			else {
				entity.body = issue.body.substr(0, oldGissueIndex)
					+ gissue
					+ issue.body.substr(oldGissueEndIndex + 1);
			}
		}

		var url = issue.url + '?' + options.access_token;

		$.ajax({
			url: url,
			type: 'POST',
			data: JSON.stringify(entity),
			processData: false, 
			error: function (xhr, textStatus, errorThrown) {
				error('An error occurred when updating an issue in GitHub.'
					+ ' Status: ' + textStatus
					+ ', Error: ' + errorThrown);
			}
		});				
	}
}

function onIssueChanged($currentIssue) {
	var currentIssue = issues[$currentIssue.attr('data-id')];
	var $nextIssue = $currentIssue.next();
	var nextIssue = $nextIssue[0] ? issues[$nextIssue.attr('data-id')] : maxSentinel;
	var $prevIssue = $currentIssue.prev();
	var prevIssue = $prevIssue[0] ? issues[$prevIssue.attr('data-id')] : minSentinel;
	var newStatus = $currentIssue.parent().attr('id');
	var newSize = parseInt($currentIssue.children('span.label.size').text().replace('size:',''), 10);

	if (newStatus === currentIssue.gissue.status && newSize === currentIssue.gissue.size
		&& nextIssue.gissue.order > currentIssue.gissue.order
		&& prevIssue.gissue.order < currentIssue.gissue.order) {
			// current issue already has appropriate status and order; nothing to update
			return;
	}

	currentIssue.gissue.status = newStatus;
	currentIssue.gissue.size = newSize;
	var issuesToUpdate = [ currentIssue ];

	// all preceding siblings  that have their order equal to maxSentinel.gissue.order must 
	// have their order and status set now so that effective order of 
	// the current issue is preserved on refresh

	while (prevIssue.gissue.order === maxSentinel.gissue.order) {
		issuesToUpdate.push(prevIssue);
		$prevIssue = $($prevIssue).prev();
		prevIssue = $prevIssue[0] ? issues[$prevIssue.attr('data-id')] : minSentinel;
	}

	// adjust order of issues to update

	var space = nextIssue.gissue.order - prevIssue.gissue.order;
	var spacing = space / (issuesToUpdate.length + 1);
	var currentOrder = nextIssue.gissue.order - spacing;
	for (var i in issuesToUpdate) {
		issuesToUpdate[i].gissue.order = currentOrder;
		currentOrder -= spacing;
	}

	updateIssues(issuesToUpdate);
}

function populateWhiteboard() {
	clearError();

	issues.sort(function (a, b) {
		return a.gissue.order - b.gissue.order;
	});
	
	for (var i in issues) {
		$('#' + issues[i].gissue.status).append(createIssueElement(i));
	}

	$('.gnote').mouseover(function(e) {
		if ($(e.target).hasClass('size')) {
			$(e.target).css('cursor', 'pointer');
			return;
		}
		$(this).css('cursor', 'move');
	});

	$('.gissueList').sortable({ 
		connectWith: '.gissueList',
		update: function (e, ui) {
			if (!ui.sender) {
				onIssueChanged($(ui.item[0]));
			}
		}
	});			
}

function parseGissueStatus(issue) {
	if (issue.body) {			
		var index = issue.body.lastIndexOf('@gissues:{');
		if (index !== -1) {
			try {
				var gissue = JSON.parse(issue.body.substring(index + 9, issue.body.indexOf('}', index + 9) + 1));
				issue.gissue = {
					order: gissue.order || maxSentinel.gissue.order,
					status: gissue.status || 'backlog',
					size: gissue.size || 0
				};
				return;
			}
			catch (e) {
			}
		}
	}

	issue.gissue = {
		order: maxSentinel.gissue.order, 
		status: 'backlog',
		size: 0
	};
}

function onIssuesLoaded() {
	for (var issue in issues) {				
		parseGissueStatus(issues[issue]);
	}

	populateWhiteboard();
}

function loadIssues(page, state, callback) {
	var url = 'https://api.github.com/repos/' + options.repo + '/issues' +
		'?' + options.access_token + 
		'&per_page=100' +
		'&page=' + page +
		'&state=' + state;

	if (options.labels) {
		url += '&labels=' + encodeURIComponent(options.labels);
	}
	if (options.assignee) {
		url += '&assignee=' + encodeURIComponent(options.assignee);
	}
	if (options.mentioned) {
		url += '&mentioned=' + encodeURIComponent(options.mentioned);
	}
	if (options.milestone) {
		url += '&milestone=' + encodeURIComponent(options.milestone);
	}

	$.ajax({
		url: url,
		error: function (xhr, textStatus, errorThrown) {
			if (xhr && xhr.status === 410) {
				callback('Issue tracking is disabled for this GitHub repository <a href="https://github.com/'
					+ options.repo + '/admin" class="btn small gsmall success">Change it...</a>');
			}
			else {
				callback('An error occurred when retrieving issues from GitHub. Make sure issue tracking is enabled. '
					+ '<a href="https://github.com/' 
					+ options.repo + '/admin" class="btn small gsmall success">Check now...</a>');
			}
		},
		success: function (data, textStatus, xhr) {
			var count = data.length;
			filter(data, /^https:\/\/github.com\/.*\/issues\/\d+$/);
			issues = issues.concat(data);
			if (count === 100) {
				loadIssues(page + 1, state, callback);
			}
			else {
				//onIssuesLoaded();
				callback();
			}
		}
	});
}
function filter(issues, regex) {
	for (var i=issues.length-1; i >= 0; i--) {
		if ( issues[i].html_url && issues[i].html_url.match(regex) ) {
			continue;
		}
		issues.splice(i, 1);
	}
}

function getQuery() {
	var delim = '?';
	var query= '';
	for (var p in options) {
		if (options[p] && 'access_token' !== p && 'specifiedRepo' !==p ) {
			query += delim + p + '=' + encodeURIComponent(options[p]);
			delim = '&';
		}
	}

	return query;	
}

function refreshPage() {
	var query = getQuery();
	var index = window.location.href.indexOf('?');
	if (index === -1) {
		window.location = window.location.href + query;
	}
	else {
		window.location = window.location.href.substr(0, index) + query;
	}
}

function warningChooseRepo() {
	error('Start by selecting a repository.', 'warning');
}

function onRepoSelected(repo, refresh) {
	// $('.gissueList').empty();
	// issues = [];
	// loadedIssues = 0;
	if (repo) {
		options.repo = repo.url.substr('https://api.github.com/repos/'.length);
		if (refresh) {
			refreshPage();
		}
		else {
			if (options.specifiedRepo) {
				for (var idx = 0; idx < options.specifiedRepo.length; idx++ ) {
					var current = options.specifiedRepo[idx];
					if (current.uri === options.repo) {
						options.sprintSize = current.sprintSize;
					}
				}
			}

			$('li>a#burndown').attr('href','/burndown?' +
				'repo=' + encodeURIComponent(options.repo) +
				'&milestone=' + encodeURIComponent(options.milestone)+
				(options.sprintSize ? '&sprintSize=' + options.sprintSize : '') );
			issues = [];
			loadedIssues = 0;
			async.parallel([
				function(callback) {
					loadIssues(1, 'open', callback);	
				},
				function(callback) {
					loadIssues(1, 'closed', callback);	
				}
			],
			function(err, results) {
				if (err) {
					return error(err);
				}
				onIssuesLoaded();
			});
		}
	}
	else {
		options.repo = undefined;
		warningChooseRepo();
	}
}

function onReposLoaded() {
	repos.sort(function (a,b) {
		if (!a.urll) a.urll = a.url.toLowerCase();
		if (!b.urll) b.urll = b.url.toLowerCase();
		if (a.urll < b.urll) return -1;
		if (a.urll > b.urll) return 1;
		return 0;
	});

	var matchingRepo;
	for (var i in repos) {
		var repo = repos[i].url.substr('https://api.github.com/repos/'.length);
		if (options.repo === repo) {
			matchingRepo = i;
		}

		$('#repo').append($(
			'<option value="' + i + '">' + repo + '</option>'
		));
	}

	$('#repo').change(function(){
		var id = $(this).val();
		onRepoSelected(id === "none" ? undefined : repos[id], true);
	});

	if (matchingRepo) {
		$('#repo').val(matchingRepo);
		onRepoSelected(repos[matchingRepo], false);
	}
	else if (options.repo) {
		error('You don\'t have access to the ' + options.repo + ' repository. Select one from the list.');
	}
	else {
		warningChooseRepo();
	}
}

function loadRepositories() {

	var targetSources = 2 + ( options.specifiedRepo ? options.specifiedRepo.length : 0 );
	var loadedSources = 0;

	// load user repos
	loadRepos('https://api.github.com/user/repos');

	// load specified repo
	if (options.specifiedRepo) {
		for (var i = 0; i < options.specifiedRepo.length; i++) {
			loadRepos('https://api.github.com/repos/' + options.specifiedRepo[i].uri);
		}
	}

	function loadRepos(repoUrl) {
		var url = repoUrl
			+ '?' + options.access_token
			+ '&per_page=100'
			+ '&type=all';

		$.ajax({
			url: url,
			error: function (xhr, textStatus, errorThrown) {
				error('An error occurred when retrieving user repositories from GitHub.'
					+ ' Status: ' + textStatus
					+ ', Error: ' + errorThrown);
			},
			success: function (data, textStatus, xhr) {
				repos = repos.concat(data);
				if (++loadedSources === targetSources) {
					onReposLoaded();
				}
			}
		});
	}

	// load orgs the user belongs to			

	var url = 'https://api.github.com/user/orgs'
		+ '?' + options.access_token
		+ '&per_page=100';

	$.ajax({
		url: url,
		error: function (xhr, textStatus, errorThrown) {
			error('An error occurred when retrieving organizations from GitHub.'
				+ ' Status: ' + textStatus
				+ ', Error: ' + errorThrown);
		},
		success: function (data, textStatus, xhr) {
			if (typeof data === 'object' && data.length >= 0)
			{
				targetSources += data.length;
				if (++loadedSources === targetSources) {
					onReposLoaded();
				}
				else {
					// load repos of all orgs the user belongs to
					for (var i in data) {
						var org = data[i];
						if (typeof org.login === 'string') {
							var url = 'https://api.github.com/orgs/' + org.login + '/repos'
								+ '?' + options.access_token
								+ '&type=all'
								+ '&per_page=100';

							$.ajax({
								url: url,
								error: function (xhr, textStatus, errorThrown) {
									error('An error occurred when retrieving organization repositories from GitHub.'
										+ ' Status: ' + textStatus
										+ ', Error: ' + errorThrown);
								},
								success: function (data, textStatus, xhr) {
									repos = repos.concat(data);
									if (++loadedSources === targetSources) {
										onReposLoaded();
									}
								}
							});				
						}
						else if (++loadedSources === targetSources) {
							onReposLoaded();
						}			
					}
				}
			}
		}
	});				
}
function updateOptions($changedElement) {
	var val = $changedElement.val() ? $changedElement.val().replace(' ', '') : '';
	var id = $changedElement.attr('id');
	options[id] = '' === val ? undefined : val;
	$('#go').attr('href', getQuery());	
}

function onFilterChanged() {
	updateOptions($(this));
}

function onFilterApproved(event) {
	if (event.which === 13) {
		updateOptions($(this));
		refreshPage();	
	}
}

$(function() {
	$.ajaxSetup({
		dataType: "json"
	});//TODO it's strange that this setting don't work in some browser.
	parseOptions();
	$('.gfilter').change(onFilterChanged).keypress(onFilterApproved);
	loadRepositories();
	$('#go').attr('href', getQuery());//TODO there is post-get 304 problem if the href doesn't change.
	$(function() {
		//TODO need refactoring
		var sel = '<select style="width: auto"><option selected="selected" value="-1">--</option><option value="1">1</option>' + 
			'<option value="2">2</option><option value="3">3</option><option value="4">4</option>' +
			'<option value="5">5</option><option value="6">6</option><option value="7">7</option></select>';
		var span = '<span class="label size gissueLabel" style="color: black; cursor: pointer;">size:0</span>';
		$('div.glive').on('click', 'div.span4 > span.size', function(e) {
			$(this).replaceWith(sel);
		});
		$('div.glive').on('change', 'select', function() {
			var $currentIssue = $(this).parent('.span4.gnote');
			$(this).replaceWith(span.replace('size:0', 'size:'+$(this).val()));
			onIssueChanged($currentIssue);
		});
	});
});
