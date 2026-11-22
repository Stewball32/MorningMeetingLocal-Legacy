/// <reference path="../pb_data/types.d.ts" />

// A person is active (shown on the slides) unless the request that creates them says otherwise.
// PocketBase bool fields default to false and the admin dashboard leaves untouched switches out
// of its request, so without this people added there would be hidden from every slide.
// (The /people editor always sends `active` itself. Records saved by migrations or other hooks
// don't go through this hook.)
onRecordCreateRequest((e) => {
	const body = e.requestInfo().body;
	if (!Object.prototype.hasOwnProperty.call(body, 'active')) e.record.set('active', true);
	e.next();
}, 'people');
