#!/usr/bin/gjs
/*
 * Copyright (c) 2015 Red Hat, Inc.
 *
 * GNOME Maps is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * GNOME Maps is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with GNOME Maps; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Authors: Alberto Ruiz <aruiz@redhat.com>
 *          Oliver Gutiérrez <ogutierrez@redhat.com>
 */

const GLib           = imports.gi.GLib;
const Gio            = imports.gi.Gio;
const JsUnit         = imports.jsUnit;
const FleetCommander = imports.fleet_commander_logger;

FleetCommander._debug = true;

//Mainloop
const ml = imports.mainloop;

var PROFILES_FILE_CONTENT = `[General]
StartWithLastProfile=0

[Profile0]
Name=default
IsRelative=1
Path=robuvvg2.default
Default=1

[Profile1]
Name=Clean
IsRelative=1
Path=bd8ay27s.Clean
`;

var PROFILES_FILE_CONTENT_NO_DEFAULT = `[General]
StartWithLastProfile=0

[Profile0]
Name=default
IsRelative=1
Path=robuvvg2.default

[Profile1]
Name=Clean
IsRelative=1
Path=bd8ay27s.Clean
`;

var RAW_PREFS_DATA = `# Mozilla User Preferences

/* Do not edit this file.
 *
 * If you make changes to this file while the application is running,
 * the changes will be overwritten when the application exits.
 *
 * To make a manual change to preferences, you can visit the URL about:config
 */

user_pref("accessibility.typeaheadfind.flashBar", 0);
user_pref("beacon.enabled", false);
user_pref("browser.bookmarks.restore_default_bookmarks", false);
user_pref("browser.newtabpage.enhanced", false);
user_pref("browser.newtabpage.introShown", true);
user_pref("browser.newtabpage.storageVersion", 1);
`;

var DEFAULT_PREFERENCES_DATA = {
    "accessibility.typeaheadfind.flashBar": "0",
    "beacon.enabled": "false",
    "browser.bookmarks.restore_default_bookmarks": "false",
    "browser.newtabpage.enhanced": "false",
    "browser.newtabpage.introShown": "true",
    "browser.newtabpage.storageVersion": "1"
};


var RAW_PREFS_DATA_MODIFIED = `# Mozilla User Preferences

/* Do not edit this file.
 *
 * If you make changes to this file while the application is running,
 * the changes will be overwritten when the application exits.
 *
 * To make a manual change to preferences, you can visit the URL about:config
 */

user_pref("accessibility.typeaheadfind.flashBar", 1);
user_pref("beacon.enabled", false);
user_pref("browser.bookmarks.restore_default_bookmarks", false);
user_pref("browser.newtabpage.enhanced", true);
user_pref("browser.newtabpage.testValue", 1);
`;

var UPDATED_PREFERENCES_DATA = {
    "accessibility.typeaheadfind.flashBar": "1",
    "beacon.enabled": "false",
    "browser.bookmarks.restore_default_bookmarks": "false",
    "browser.newtabpage.enhanced": "true",
    "browser.newtabpage.introShown": "true",
    "browser.newtabpage.storageVersion": "1",
    "browser.newtabpage.testValue": "1"
};

function setup_test_directory(profinit, prefsinit) {
    // Create a temporary directory for testing
    let TMPDIR = GLib.dir_make_tmp('fc_logger_firefox_XXXXXX')
    // Create profiles file
    if (profinit) {
        JsUnit.assertTrue(
            GLib.file_set_contents(TMPDIR + '/profiles.ini',
                PROFILES_FILE_CONTENT));
    }
    // Create profile directory
    JsUnit.assertEquals(0,
        GLib.mkdir_with_parents(TMPDIR + '/robuvvg2.default/', 0o755));

    // Initialize preferences file
    if (prefsinit) {
        JsUnit.assertTrue(
            GLib.file_set_contents(TMPDIR + '/robuvvg2.default/prefs.js',
            RAW_PREFS_DATA));
    }

    return TMPDIR;
}

function mainloop_quit_callback() {
    printerr('Timed out waiting for file update notification. Test probably failed');
    ml.quit();
}

/* Mock objects */

var MockConnectionManager = function () {
  this.log = [];
}

MockConnectionManager.prototype.submit_change = function (namespace, data) {
  this.log.push([namespace, data]);
}

MockConnectionManager.prototype.pop = function () {
  return this.log.pop();
}

function testGetDefaultProfilePath () {
    // Setup test directory
    var TMPDIR = setup_test_directory(true, false);

    let mgr = new MockConnectionManager();
    let firefox_logger = new FleetCommander.FirefoxLogger(mgr, TMPDIR);

    // Get default profile
    JsUnit.assertEquals(
        TMPDIR + '/robuvvg2.default',
        firefox_logger.get_default_profile_path());

    // Try to get a default profile from a file that does not have a default one
    JsUnit.assertTrue(
        GLib.file_set_contents(TMPDIR + '/profiles.ini',
            PROFILES_FILE_CONTENT_NO_DEFAULT));
    JsUnit.assertEquals(
        null,
        firefox_logger.get_default_profile_path());

    // Try to read a wrong profiles file
    JsUnit.assertTrue(
        GLib.file_set_contents(TMPDIR + '/profiles.ini',
            'RESISTANCE IS FUTILE'));
    JsUnit.assertEquals(
        null,
        firefox_logger.get_default_profile_path());
}

function testReadPreferences () {
    // Setup test directory
    var TMPDIR = setup_test_directory(true, false);

    let mgr = new MockConnectionManager();
    let firefox_logger = new FleetCommander.FirefoxLogger(mgr, TMPDIR);

    // Get preferences from given data
    let returned = firefox_logger.load_firefox_preferences(RAW_PREFS_DATA);
    JsUnit.assertEquals(
        JSON.stringify(DEFAULT_PREFERENCES_DATA),
        JSON.stringify(returned));
}

function testProfilesFileLoad() {
    // Setup test directory with profile file
    var TMPDIR = setup_test_directory(true, false);

    let mgr = new MockConnectionManager();
    let firefox_logger = new FleetCommander.FirefoxLogger(mgr, TMPDIR);

    // Profiles file is present. It should be initialized
    JsUnit.assertTrue(firefox_logger.default_profile_initialized);

    // Also there souldn't be any file monitor for it
    JsUnit.assertFalse(
        (TMPDIR + '/profiles.ini') in firefox_logger.file_monitors);
}

function testProfilesFileLoadWrong() {
    // Setup test directory without profile file
    var TMPDIR = setup_test_directory(false);

    // Add profiles file without default profile
    JsUnit.assertTrue(
        GLib.file_set_contents(TMPDIR + '/profiles.ini',
            PROFILES_FILE_CONTENT_NO_DEFAULT));

    let mgr = new MockConnectionManager();
    let firefox_logger = new FleetCommander.FirefoxLogger(mgr, TMPDIR);

    // Profiles file is present. It should be initialized
    JsUnit.assertFalse(firefox_logger.default_profile_initialized);

    // Also there sould be a file monitor for it
    JsUnit.assertTrue(
        (TMPDIR + '/profiles.ini') in firefox_logger.file_monitors);
}

function testProfilesFileMonitoringNoDefault () {
    // Setup test directory
    var TMPDIR = setup_test_directory(false, false);

    let mgr = new MockConnectionManager();
    let firefox_logger = new FleetCommander.FirefoxLogger(mgr, TMPDIR);

    // Profiles file is not present. It should not be initialized
    JsUnit.assertFalse(firefox_logger.default_profile_initialized);

    // Setup callback for profiles file update
    firefox_logger.__test_profiles_file_updated = ml.quit;

    // Setup a timeout for this test to quit and fail if timeout is reached
    let timeout = GLib.timeout_add (GLib.PRIORITY_HIGH, 3000, mainloop_quit_callback);

    // Add profiles file without default profile
    JsUnit.assertTrue(
        GLib.file_set_contents(TMPDIR + '/profiles.ini',
            PROFILES_FILE_CONTENT_NO_DEFAULT));

    // Execute main loop
    ml.run();

    // Default profile should not be initialized yet
    JsUnit.assertFalse(firefox_logger.default_profile_initialized);
}

function testProfilesFileMonitoring() {
    // Setup test directory
    var TMPDIR = setup_test_directory(false, false);

    let mgr = new MockConnectionManager();
    let firefox_logger = new FleetCommander.FirefoxLogger(mgr, TMPDIR);

    // Profiles file is not present. It should not be initialized
    JsUnit.assertFalse(firefox_logger.default_profile_initialized);

    // Setup callback on profiles file update
    firefox_logger.__test_profiles_file_updated = ml.quit;

    // Setup a timeout for this test to quit and fail if timeout is reached
    let timeout = GLib.timeout_add (GLib.PRIORITY_HIGH, 3000, mainloop_quit_callback);

    // Add profiles file
    JsUnit.assertTrue(
        GLib.file_set_contents(TMPDIR + '/profiles.ini',
            PROFILES_FILE_CONTENT));

    // Execute main loop
    ml.run();

    // Default profile preferences should be initialized at this point
    JsUnit.assertTrue(firefox_logger.default_profile_initialized);
}

function testPreferencesFileMonitoringWrong() {
    // Setup test directory
    var TMPDIR = setup_test_directory(true, false);

    let mgr = new MockConnectionManager();
    let firefox_logger = new FleetCommander.FirefoxLogger(mgr, TMPDIR);

    // Profiles file is present. It should be initialized
    JsUnit.assertTrue(firefox_logger.default_profile_initialized);

    // Default profile preferences file is not present. Shouldn't be initialized
    JsUnit.assertFalse(firefox_logger.default_profile_prefs_initialized);

    // Current preferences should be empty
    JsUnit.assertEquals(
        JSON.stringify({}),
        JSON.stringify(firefox_logger.monitored_preferences));

    // Setup callback on profiles file update
    firefox_logger.__test_prefs_file_updated = ml.quit;

    // Setup a timeout for this test to quit and fail if timeout is reached
    let timeout = GLib.timeout_add (GLib.PRIORITY_HIGH, 3000, mainloop_quit_callback);

    // Add profiles file
    JsUnit.assertTrue(
        GLib.file_set_contents(TMPDIR + '/robuvvg2.default/prefs.js',
            'WRONG CONTENT'));

    // Execute main loop
    ml.run();

    // Default profile preferences should be initialized at this point
    JsUnit.assertTrue(firefox_logger.default_profile_prefs_initialized);

    // Wrong content only leads to empty preferences
    JsUnit.assertEquals(
        JSON.stringify({}),
        JSON.stringify(firefox_logger.monitored_preferences));
}


function testPreferencesFileMonitoring() {
    // Setup test directory
    var TMPDIR = setup_test_directory(true, false);

    let mgr = new MockConnectionManager();
    let firefox_logger = new FleetCommander.FirefoxLogger(mgr, TMPDIR);

    // Profiles file is present. It should be initialized
    JsUnit.assertTrue(firefox_logger.default_profile_initialized);

    // Preferences file is not present. It shouldn't be initialized
    JsUnit.assertFalse(firefox_logger.default_profile_prefs_initialized);

    // Preferences data should be empty
    JsUnit.assertEquals(
        JSON.stringify({}),
        JSON.stringify(firefox_logger.monitored_preferences));

    // Setup callback on profiles file update
    firefox_logger.__test_prefs_file_updated = ml.quit;

    // Setup a timeout for this test to quit and fail if timeout is reached
    let timeout = GLib.timeout_add (GLib.PRIORITY_HIGH, 3000, mainloop_quit_callback);

    // Add profiles file
    JsUnit.assertTrue(
        GLib.file_set_contents(TMPDIR + '/robuvvg2.default/prefs.js',
            RAW_PREFS_DATA));

    // Execute main loop
    ml.run();

    // Preferences file is now present. It should be initialized
    JsUnit.assertTrue(firefox_logger.default_profile_prefs_initialized);

    // Default preference data should be loaded
    JsUnit.assertEquals(
        JSON.stringify(DEFAULT_PREFERENCES_DATA),
        JSON.stringify(firefox_logger.monitored_preferences));
}

function testPreferencesFileLoading() {
    // Setup test directory
    var TMPDIR = setup_test_directory(true, true);

    let mgr = new MockConnectionManager();
    let firefox_logger = new FleetCommander.FirefoxLogger(mgr, TMPDIR);

    // Profiles file is present. It should be initialized
    JsUnit.assertTrue(firefox_logger.default_profile_initialized);

    // Preferences file is now present. It should be initialized
    JsUnit.assertTrue(firefox_logger.default_profile_prefs_initialized);

    // Default preference data should be loaded
    JsUnit.assertEquals(
        JSON.stringify(DEFAULT_PREFERENCES_DATA),
        JSON.stringify(firefox_logger.monitored_preferences));
}

function testPreferencesUpdate() {
    // Setup test directory
    var TMPDIR = setup_test_directory(true, true);

    let mgr = new MockConnectionManager();
    let firefox_logger = new FleetCommander.FirefoxLogger(mgr, TMPDIR);

    // Profiles file is present. It should be initialized
    JsUnit.assertTrue(firefox_logger.default_profile_initialized);

    // Preferences file is now present. It should be initialized
    JsUnit.assertTrue(firefox_logger.default_profile_prefs_initialized);

    // Default preference data should be loaded
    JsUnit.assertEquals(
        JSON.stringify(DEFAULT_PREFERENCES_DATA),
        JSON.stringify(firefox_logger.monitored_preferences));

    // Setup callback on profiles file update
    firefox_logger.__test_prefs_file_updated = ml.quit;

    // Setup a timeout for this test to quit and fail if timeout is reached
    let timeout = GLib.timeout_add (GLib.PRIORITY_HIGH, 3000, mainloop_quit_callback);

    // Overwrite profiles file with modified data
    JsUnit.assertTrue(
        GLib.file_set_contents(TMPDIR + '/robuvvg2.default/prefs.js',
            RAW_PREFS_DATA_MODIFIED));

    // Execute main loop
    ml.run();

    // Check preference data has been updated
    JsUnit.assertEquals(
        JSON.stringify(UPDATED_PREFERENCES_DATA),
        JSON.stringify(firefox_logger.monitored_preferences));

    // Config changes should be submitted
    JsUnit.assertEquals(
        JSON.stringify(["org.mozilla.firefox", '{"key":"browser.newtabpage.testValue","value":"1"}']),
        JSON.stringify(mgr.pop()));

    JsUnit.assertEquals(
        JSON.stringify(["org.mozilla.firefox", '{"key":"browser.newtabpage.enhanced","value":"true"}']),
        JSON.stringify(mgr.pop()));

    JsUnit.assertEquals(
        JSON.stringify(["org.mozilla.firefox", '{"key":"accessibility.typeaheadfind.flashBar","value":"1"}']),
        JSON.stringify(mgr.pop()));
}

JsUnit.gjstestRun(this, JsUnit.setUp, JsUnit.tearDown);