/* This script loads and run a pretrained TFJS model on your computer.
This is the model that determines how your playlist is classified.

*/

var model;

var classNames = ['Early Morning/Late Night', 'Morning', 'Afternoon', 'Evening', 'Night'];


var predictions = new Array();


// Load model async.

async function start() {
	model = await tf.loadLayersModel('model/model.json');
	
	// Testing a prediction
	const shape = [1,6];
	thisPred = model.predict(tf.tensor([0,.5,.5,.2,.9,.3], shape)).dataSync();
	console.log(thisPred);
	
}

// This function makes a test prediction
function makePrediction() {
	console.log('Making prediction:')
	
	const shape = [1,6];
	const pred = model.predict(tf.tensor([0.,.3,.3,.2,.5,.2], shape)).dataSync();
	const indices = findIndicesOfMax(pred, 5);
	const probs = findTopValues(pred, 5);
	const names = getClassNames(indices);
	console.log(names);
	setTable(names, probs);

}

// This function predicts a track 
async function singleTrackPrediction(predictionData) {
	//console.log('Making prediction on track')
	const shape = [1,6];
	if (!model) model = await tf.loadLayersModel('model/model.json');
	const pred = model.predict(tf.tensor(predictionData, shape)).dataSync();
	const indices = findIndicesOfMax(pred, 5);
	const probs = findTopValues(pred, 5);

	return probs;

}

// This function predicts many tracks
async function multiTrackPrediction(multiPredictionData) {
	console.log('Making multiple predictions');
	multiPredicted = new Array();
	const shape = [1,6];
	if (!model) model = await tf.loadLayersModel('model/model.json');
	for (var i=0, len=multiPredictionData.length; i<len; i++) {
		thisTrackData = multiPredictionData[i];
		
		thisPrediction = await model.predict(tf.tensor(thisTrackData.slice(1), shape)).dataSync();
		thisIndices = findIndicesOfMax(thisPrediction, 5);
		thisProbs = findTopValues(thisPrediction, 5);
		multiPredicted.push([i, thisProbs]);
	}
	return multiPredicted;
}

// This function remaps values to fit what the model trained on.
function remap(x, oMin, oMax, nMin, nMax) {
	reverseInput = 0;
	oldMin = Math.min(oMin, oMax);
	oldMax = Math.max(oMin, oMax);
	
	if (!oldMin == oMin){
		reverseInput = 1;
	};
	reverseOutput = 0;
	newMin = Math.min(nMin, nMax);
	newMax = Math.max(nMin, nMax);
	
	if (!newMin == nMin) {
		reverseOutput=1;
	}
	
	portion = (x-oldMin)*(newMax-newMin)/(oldMax-oldMin);
	if (reverseInput==1) {
		portion = (oldMax-x)*(newMax-newMin)/(oldMax-oldMin);
	}
	result = portion + newMin;
	if (reverseOutput==1) {
		result=newMax - portion;
	}
	return result;
	
	
}


// This function does the analysis
function analysePlaylist(playlistData) {
	console.log('Starting analysis');

	
	var featuresData= new Array();
	
	for (track in playlistData) {
		//console.log(track);
		var thisTrack = playlistData[track];

		featuresData.push([track, remap(thisTrack.danceability, 0, 1, -1, 1),
		remap(thisTrack.energy, 0, 1, -1, 1),
		remap(thisTrack.loudness, -60, 12, -1, 1),
		remap(thisTrack.liveness, 0, 1, -1, 1),
		remap(thisTrack.valence, 0, 1, -1, 1),
		remap(thisTrack.tempo, 40, 220, -1, 1)]);

		
	}
	
	
	// Calling multitrack prediction.
	
	var multiPredictions = multiTrackPrediction(featuresData);

	var done = multiPredictions;
	return done
	
	
}




// Get indices
// Taken from zaidalyafeai on github.

function findIndicesOfMax(inp, count) {
    var outp = [];
    for (var i = 0; i < inp.length; i++) {
        outp.push(i); 
        if (outp.length > count) {
            outp.sort(function(a, b) {
                return inp[b] - inp[a];
            }); 
            outp.pop();
        }
    }
    return outp;
}


// Get top prediction
// Taken from zaidalyafeai on github.

function findTopValues(inp, count) {
    var outp = [];
    let indices = findIndicesOfMax(inp, count)
    for (var i = 0; i < indices.length; i++)
        outp[i] = inp[indices[i]]
    return outp
}

// Get class name
// Taken from zaidalyafeai on github.

function getClassNames(indices) {
    var outp = []
    for (var i = 0; i < indices.length; i++)
        outp[i] = classNames[indices[i]]
    return outp
}




// Calculate average prediction, and best prediction

function averagePrediction(predictionData) {
	//write this annoyingly hard-coded.
	prob0 = 0;
	prob1 = 0;
	prob2 = 0;
	prob3 = 0;
	prob4 = 0;
	for (i=0; i<predictionData.length; i++) {
		thisArray = predictionData[i][1];
		prob0+=thisArray[0];
		prob1+=thisArray[1];
		prob2+=thisArray[2];
		prob3+=thisArray[3];
		prob4+=thisArray[4];
	}
	avgProb0 = prob0/predictionData.length;
	avgProb1 = prob1/predictionData.length;
	avgProb2 = prob2/predictionData.length;
	avgProb3 = prob3/predictionData.length;
	avgProb4 = prob4/predictionData.length;
	
	results = [avgProb0, avgProb1, avgProb2, avgProb3, avgProb4];
	//console.log(result)
	return results
	
	
}







