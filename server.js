/*
A Day in the Life
This node.js app uses a pre-trained tensorflowjs model to classify Spotify playlists to one of multiple subdivision of the day.

For questions contact Ole Adrian Heggli @ Center for Music in the Brain


*/


// Initiate server etc
const express = require('express')
const session = require('express-session');
var request = require('request'); // "Request" library
const app = express()
const port = 8080
var querystring = require('querystring');
var cors = require('cors');
const {v4:uuidv4} = require('uuid');
var favicon = require('serve-favicon');

// Use google cloud as datastore for session.
const {Datastore} = require('@google-cloud/datastore');
const DatastoreStore = require('@google-cloud/connect-datastore')(session);


// Connect to mongodb database

const uri = "HIDDEN";
const MongoClient = require('mongodb').MongoClient(uri, { useUnifiedTopology: true });
// connecting to database
var dbo;

async function connectToDatabase(){
	await MongoClient.connect(async function(err, db) {
		if (err) throw err;
		console.log('Connecting to database');
		dbo = db.db('spotifyRecords');
	});
}
connectToDatabase();

// Error messages for html as global variables

const audioError = 'We were unable to get the audio features for one or more of the tracks in your playlist. Please try another playlist.';
const tracksError = 'We were unable to get a list of the tracks in your playlist. Please try another playlist, or try again later.';
const authError = 'We are currently having problems with connecting to Spotify. Please try again at a later time.';
const meError = 'We were unable to get information about your user on Spotify. Please try again at a later time.';
const playlistError = 'We were unable to get your playlists. Make sure you have at least one playlist in your Spotify account, and then try again';
const rateError = 'Our app is currently too popular! We are currently unable to analyse your playlists. Please try again at a later time';
const zeroLengthError = 'You have selected a playlist with zero tracks. Please try another playlist.';
const zeroAudioFeaturesError = 'We were unable to get audio features for this playlist. Perhaps you chose a playlist with only local tracks? Please try another playlist.';
const unauthorizedError = 'We experienced a problem getting data from your Spotify account. Please log out, and try again.';


// Use handlebars
const handlebars = require('express-handlebars');

app.set('view engine', 'handlebars');
app.engine('handlebars', handlebars({
	layoutsDir:__dirname + '/views/layouts',
}));


// Use static public
app.use(cors())
	.use(express.static('public/'));
app.use(favicon('public/favicon.ico'));
app.use(express.urlencoded({ extended: true }));
// Set session stuff
app.set('trust proxy', 1);
app.use(session({
	store: new DatastoreStore({
		kind: 'express-sessions',
		expirationMs: 3600000,
		dataset: new Datastore({

		  // For convenience, @google-cloud/datastore automatically looks for the
		  // GCLOUD_PROJECT environment variable. Or you can explicitly pass in a
		  // project ID here:
		  //projectId: process.env.GCLOUD_PROJECT,

		  // For convenience, @google-cloud/datastore automatically looks for the
		  // GOOGLE_APPLICATION_CREDENTIALS environment variable. Or you can
		  // explicitly pass in that path to your key file here:
		  //keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
		})
	  }),
	secret: 'thisisafairlyrandomstringeventhoughitdoesnotcontainmultiplernumbersorsymbols',
	secure: true,
	resave: false,
	saveUninitialized: true,
	cookie: {secure: true, maxAge:60*60*1000}
}));



// Initiate the SpotifyWebApi

var scope = ['playlist-read-private', 'playlist-read-collaborative'];
var redirect_uri = 'https://spotifyplaylistclassifier.ew.r.appspot.com/callback';
//var redirect_uri = 'http://localhost:8080/callback';
var client_secret = 'HIDDEN';
var client_id = 'HIDDEN';

var SpotifyWebApi = require('spotify-web-api-node');
var spotifyApi = new SpotifyWebApi({
	clientId: client_id,
	clientSecret: client_secret,
	redirectUri: redirect_uri
});


// Start server
const server = app.listen(8080, () => {
	const host = server.address().address;
	const port = server.address().port;
	console.log('Spotify Classification app now running.');
});

// Landing page
app.get('/', (req, res) => {	
	var sess = req.session;
	// check here if user is already logged.
	if(sess.thisUser == undefined){
	
		sess.thisUniqueUser = uuidv4();
		res.render('main', {layout : 'index'});
	} else {
		console.log('Returning visitor');
		if(sess.thisUniqueUser == undefined){
			sess.thisUniqueUser = uuidv4();
		}
		// Should probably not have them sign in again, but I won't fuck with refresh tokens
		res.render('main', {layout : 'index'});
	}
});




// Some SpotifyAPI related stuff
var stateKey = 'spotify_auth_state';
var generateRandomString = function(length) {
	var text = '';
	var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

	for (var i = 0; i < length; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
};


// Handle login
app.get('/login', 
function(req, res) {
	
	var state = generateRandomString(16);
	// your application requests authorization
	var scope = 'playlist-read-collaborative playlist-read-private';
	res.redirect('https://accounts.spotify.com/authorize?' +
		querystring.stringify({
			response_type: 'code',
			client_id: client_id,
			scope: scope,
			redirect_uri: redirect_uri,
			state: state
		}));
});

// Handle successful login
app.get('/callback',
function(req,res){
	var sess = req.session;
	var code = req.query.code;
	var state = req.query.state;
	
	spotifyApi.authorizationCodeGrant(code)
		.then(function(data) {
			var thisData = data.body
			var authCode = thisData.access_token;
			//console.log('This authcode is: ' + authCode);
			sess.authCode = authCode;
			
			res.render('getPlaylist', {layout : 'index'});
		}, function(err) {
			if(err['statusCode']==429){
				//rateLimited();
				console.log('Rate error!!!');
				res.render('errorPage', {layout: 'index',
									customError: rateError});
				return
			} else if(err['statusCode']==401) {
				console.log('Authorization error at callback.');
				res.render('errorPage', {layout: 'index',
									customError: unauthorizedError});
				return
			}
			console.log('Something went wrong with getting the authorization code?');
			res.render('errorPage', {layout: 'index',
									customError: authError});
		});
	

});


// Get playlists from user
app.get('/getPlaylists',
function(req,res){

	var sess = req.session;
	// get authcode and set it
	authCode = sess.authCode;
	//console.log('Session authcode: ' + authCode);
	spotifyApi.setAccessToken(authCode);
	
	if (sess.thisUser == undefined){
		console.log('Undefined user, defining now.');
		spotifyApi.getMe().then(function(data) {
			var thisData = data.body;
			var thisUser = thisData.id;
			//setting in session
			sess.thisUser = thisUser;
			//console.log('User was defined.');
			
		}, function(err) {
			if(err['statusCode']==429){
				//rateLimited();
				console.log('Rate error!!!');
				res.render('errorPage', {layout: 'index',
									customError: rateError});
				return
			} else if(err['statusCode']==401) {
				console.log('Authorization error at defining user.');
				res.render('errorPage', {layout: 'index',
									customError: unauthorizedError});
				return
			}
		res.render('errorPage', {layout: 'index',
								customError:meError});
		console.log('Something went wrong with getting me-information', err);
	});
	} else {
		console.log('Remembered user.');
	}
	
	if (sess.playlists == undefined){
	
	//console.log('Getting playlists');
		spotifyApi.getUserPlaylists(sess.thisUser, {limit:50})
		.then(function(data) {
			thisData = data.body;
			var allPlaylists = thisData.items;
			
			var thisUsersPlaylistsIDs = new Array();
			var thisUsersPlaylistsNames = new Array();

			for (var key in allPlaylists) {

				var thisPlaylist = allPlaylists[key];
				thisName = thisPlaylist.name;
				thisId = thisPlaylist.id;
				//console.log(thisName);
				// Limit length of name here? Yes.
				if (thisName.length > 30) {
					thisName = thisName.slice(0,30);
				}
				thisUsersPlaylistsIDs.push(thisId);
				thisUsersPlaylistsNames.push(thisName);

			}

			var combinedUserPlaylists = thisUsersPlaylistsIDs.reduce(function(combinedUserPlaylists, field, index) {
			combinedUserPlaylists[thisUsersPlaylistsNames[index]] = field;
			return combinedUserPlaylists;
			}, {});

			sess.playlists = combinedUserPlaylists;
			//res.render('choosePlaylist.handlebars', {layout : 'index', data:sess.playlists});
			// Adding a re-route to the chronotype question here.
			res.render('getPersonType.handlebars', {layout : 'index'});

			
			
		}, function(err) {
			if(err['statusCode']==429){
				//rateLimited();
				console.log('Rate error!!!');
				res.render('errorPage', {layout: 'index',
									customError: rateError});
				return
			} else if(err['statusCode']==401) {
				console.log('Authorization error at getting playlist info');
				res.render('errorPage', {layout: 'index',
									customError: unauthorizedError});
				return
			}
			res.render('errorPage', {layout: 'index',
									customError: playlistError});
			console.log('Could not get playlists.', err);
			
		});
	} else {
		console.log('Remembered playlists, redirecting now');
		res.render('choosePlaylist.handlebars', {layout : 'index', data:sess.playlists});
	}
});


// Analyse the playlists locally
app.get('/analysePlaylist', 
function(req, res) {
	var sess = req.session;
	var playlistId = req.query.id;
	var analysedPlaylistID = playlistId;
	sess.thisPlaylist = analysedPlaylistID;
	thisUser = sess.thisUser;
	//console.log('Username: ' + thisUser);
	// Should I maybe pipe in the auth-code here again?
	
	authCode = sess.authCode;
	//console.log('Session authcode: ' + authCode);
	spotifyApi.setAccessToken(authCode);
	
	// first get the audio features from the tracks in playlist
	// consider adding a limit here, the default is 100
	spotifyApi.getPlaylistTracks(playlistId, {limit:100})
	.then(
		function(data) {

			thisData = data.body.items;
			tracksID = []
			for (track in thisData){

				thisTrack=thisData[track].track;
				if (thisTrack == null) {
					continue
				}
				thisTrackID = thisTrack.id;
				tracksID.push(thisTrackID);
				
			}
			if (tracksID.length == 0) {
				console.log('ERROR: 0-length playlist.');
				res.render('playlistErrorPage', {layout: 'index',
											customError: zeroLengthError});
				return
			}

			sess.thisTracksID = tracksID;
			// now analyse them
			spotifyApi.getAudioFeaturesForTracks(tracksID)
			.then(
				function(data) {
					//console.log('Got audio features for the tracks');
					var theseFeatures = data.body.audio_features;
					//console.log(data.body);
					// Now get them into a JSON
					var audioFeatures = [];
					for (track in theseFeatures){
						// Need to add an IF here for tracks that may not have
						// auditory features, or id, etc.
						theseValues = (({id, danceability, energy, loudness, speechiness, acousticness, instrumentalness, liveness, valence, tempo}) => ({id, danceability, energy, loudness, speechiness, acousticness, instrumentalness, liveness, valence, tempo}))(theseFeatures[track]);
						
						audioFeatures.push(theseValues)
					}
					if (audioFeatures.length == 0) {
						console.log('ERROR: 0-length audio features.');
						res.render('playlistErrorPage', {layout: 'index',
													customError: zeroAudioFeaturesError});
						return
					}
					//console.log(audioFeatures);
					// maybe need to stringify them
					audioFeaturesJSON = JSON.stringify(audioFeatures);
					//console.log(audioFeaturesJSON);
					
					// now push this somewhere.
					res.render('audioFeatures.handlebars', {layout : 'index', data:audioFeaturesJSON});
					
				}, function(err) {
					if(err['statusCode']==429){
						//rateLimited();
						console.log('Rate error!!!');
						res.render('errorPage', {layout: 'index',
											customError: rateError});
						return
					} else if(err['statusCode']==401) {
						console.log('Authorization error in audiofeatures.');
						res.render('errorPage', {layout: 'index',
											customError: unauthorizedError});
						return
					}
					console.log('ERROR: Did not get the audio features.');
					res.render('errorPage', {layout: 'index',
											customError: audioError});
				});
		}, function(err) {
			console.log('Something went wrong with getting the tracks in the playlist.', err);
			if(err['statusCode']==429){
				//rateLimited();
				console.log('Rate error!!!');
				res.render('errorPage', {layout: 'index',
									customError: rateError});
				return
			} else if(err['statusCode']==401) {
				console.log('Authorization error in playlists-getting.');
				res.render('errorPage', {layout: 'index',
									customError: unauthorizedError});
				return
			}
			res.render('errorPage', {layout: 'index',
									customError: tracksError});
		});
		
	
	
	
});


// Present resulting analysis
app.get('/finishedAnalysis',
function(req, res) {
	var sess = req.session;
	var best = req.query.best;
	sess.classifierOutcome = best;
	var names = req.query.time;
	var prob0 = req.query.prob0;
	var prob1 = req.query.prob1;
	var prob2 = req.query.prob2;
	var prob3 = req.query.prob3;
	var prob4 = req.query.prob4;
	//console.log(names);
	res.render('yourResults', {layout: 'index', name:names,
	prob0:prob0,
	prob1:prob1,
	prob2:prob2,
	prob3:prob3,
	prob4:prob4,
	});
	
});


// Ask questions
app.get('/questionResponse',
function(req, res) {
	var sess = req.session;
	
	var response=req.query.response;

	// construct writing to database here, for "yes", but separate one for "no".
	
	if (response=='Yes') {
		res.render('sentimentQuestion', {layout:'index'});
		var userResults={
			uID:sess.thisUniqueUser,
			chrono:sess.chrono,
			playlistID:sess.thisPlaylist,
			tracks:sess.thisTracksID,
			classified:sess.classifierOutcome,
			userResponse:1,
			userPrefered:"NAN"};
		//console.log(userResults);
		writeToDatabase(userResults);
		
	} else if (response=='No') {
		res.render('negativeResponse', {layout:'index'});
	}
	
	
});

// Handle negative answer
app.get('/userPrefered',
function(req, res) {
	var sess = req.session;
	var userPrefered=req.query.response;
	//console.log('This user prefered: ' + userPrefered);
	var userResults={
			uID:sess.thisUniqueUser,
			chrono:sess.chrono,
			playlistID:sess.thisPlaylist,
			tracks:sess.thisTracksID,
			classified:sess.classifierOutcome,
			userResponse:0,
			userPrefered:userPrefered};
			
	writeToDatabase(userResults);
	//console.log(userResults);
	//res.render('positiveResponse', {layout:'index'});
	res.render('sentimentQuestion', {layout:'index'});
	
});

// Handle sentiment submission

app.post('/sentimentSubmit',
function(req, res) {
	console.log('Processing sentiment submit');
	var sess = req.session;
	var userSentiment = req.body.sentiment_field;
	// should probably sanitize here
	userSentiment = userSentiment.slice(0,400);
	var userResults={
			uID:sess.thisUniqueUser,
			playlistID:sess.thisPlaylist,
			tracks:sess.thisTracksID,
			chrono:sess.chrono,
			sentiment:userSentiment};
	writeToDatabaseSentiment(userResults);
	res.render('positiveResponse', {layout:'index'});
});


// Handle chronotype submission

app.post('/chronoSubmit',
function(req, res) {
	var sess = req.session;
	var thisBody = req.body
	var chrono = thisBody['likert'];
	sess.chrono = chrono
	res.render('choosePlaylist.handlebars', {layout : 'index', data:sess.playlists});

});
	


// Handle logout event
app.get('/logout',
function(req, res) {
	var sess = req.session;
	//console.log('User requested logout');
	req.session.destroy();
	res.render('main', {layout:'index'});
});


// Async write to database
async function writeToDatabase(data) {
	items = await dbo.collection("productionCollection").insertOne(data);
	
}
// write sentiment
async function writeToDatabaseSentiment(data) {
	items = await dbo.collection("productionCollectionSentiment").insertOne(data);
	
}


// Handle a rate limitation if we're lucky
/*
function rateLimited() {
	console.log('Rate limited!!!');
	app.render('errorPage', {layout: 'index',
							customError: rateError}, function(err,html){
							console.log('This is some html');
							console.log(html);
							});
	return
	
}

function unauthorized() {
	console.log('Managed to get an unauthorized error');
	app.render('errorPage', {layout: 'index',
							customError: unauthorizedError}, function(err,html){
							console.log('This is some html');
							console.log(html);
							});
	return
}

*/









