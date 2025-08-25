const express = require('express');
const { getAllRecordings, deleteRecording } = require('./zoom-recordings-manager');

const app = express();
const port = 3333;

app.use(express.json());

app.get('/getRecordings', async (req, res) => {
	try {
		const recordings = await getAllRecordings();
		const result = recordings.map(recording => ({
			id: recording.id,
			duration: recording.duration,
			recordings: recording.recording_files.filter(file => file.file_type === 'MP4')
		}));

		res.json(result);
	} catch (error) {
		console.error('Error fetching recordings:', error);
		res.status(500).json({ error: 'Failed to fetch recordings' });
	}
});

app.delete('/deleteRecording', async (req, res) => {
	const { meetingId, recordId } = req.body;
	if (!meetingId || !recordId) {
		return res.status(400).json({ error: 'meetingId and recordId are required' });
	}
	try {
		await deleteRecording(meetingId, recordId);
		res.json({ success: true });
	} catch (error) {
		console.error('Error deleting recording:', error);
		res.status(500).json({ error: 'Failed to delete recording' });
	}
});

app.listen(port, () => {
	console.log(`Server running at http://localhost:${port}`);
});