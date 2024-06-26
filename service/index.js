const express = require('express');
const cookieParser = require('cookie-parser');
const DB = require('./database.js');
const bcrypt = require('bcrypt');
const app = express();
const authCookieName = 'token';
const { peerProxy } = require('./peerProxy.js');

app.use(express.json());
app.use(express.static('public'));
app.use(cookieParser());

app.use(function (err, req, res, next) {
  res.status(500).send({ type: err.name, message: err.message });
});

var apiRouter = express.Router();
app.use('/api', apiRouter);

apiRouter.post('/auth/create', async (req, res) => {
  if (await DB.getUser(req.body.email)) {
    res.status(409).send({ msg: 'Username already taken' });
  } else {
    const user = await DB.createUser(req.body.email, req.body.password);

    // Set the cookie
    setAuthCookie(res, user.token);

    res.send({
      id: user._id,
    });
  }
});

apiRouter.post('/auth/login', async (req, res) => {
  const user = await DB.getUser(req.body.email);
  if (user) {
    if (await bcrypt.compare(req.body.password, user.password)) {
      setAuthCookie(res, user.token);
      res.send({ id: user._id });
      return;
    }
  }
  res.status(401).send({ msg: 'Incorrect username or password' });
});

apiRouter.get('/user/:email', async (req, res) => {
  const user = await DB.getUser(req.params.email);
  if (user) {
    const token = req?.cookies.token;
    res.send({ email: user.email, authenticated: token === user.token });
    return;
  }
  res.status(404).send({ msg: 'Unknown' });
});

apiRouter.delete('/auth/logout', (_req, res) => {
  res.clearCookie(authCookieName);
  res.status(204).end();
});

var secureApiRouter = express.Router();
apiRouter.use(secureApiRouter);

secureApiRouter.use(async (req, res, next) => {
  authToken = req.cookies[authCookieName];
  const user = await DB.getUserByToken(authToken);
  if (user) {
    next();
  } else {
    res.status(401).send({ msg: 'Unauthorized' });
  }
});

secureApiRouter.post('/jobs', (req, res) => {
  const userJobs = DB.addJob(req.body, nextJobID++);
  if (userJobs) {
    res.send(userJobs);
  } else {
    res.status(500).send({ msg : 'Internal error fetching user jobs after adding' });
  }
  
});

secureApiRouter.get('/jobs/single/:jobID', async (req, res) => {
  const jobID = parseInt(req.params.jobID);
  const foundJob = await DB.getSingleJob(jobID);
  res.send(foundJob);
});

secureApiRouter.get('/jobs/:user', async (req, res) => {
  const username = req.params.user;
  const filteredJobs = await DB.getJobsForUser(username);
  res.send(filteredJobs);
});

apiRouter.get('/jobs/shared/:user', async (req, res) => {
  const username = req.params.user;
  const sharedJobs = await DB.getSharedJobsForUser(username);
  res.send(sharedJobs);
});

secureApiRouter.put('/jobs', (req, res) => {
  const job = DB.editJob(req.body);
  res.send(job);
});

secureApiRouter.get('/jobs', async (req, res) => {
  const username = 'user';
  const filteredJobs = await DB.getJobsForUser(username);
  res.send(filteredJobs);
});

secureApiRouter.put('/jobs/:status', (req, res) => {
  const jobID = DB.editJobStatus(req.params.status, req.body.jobID);
  res.send(JSON.stringify(jobID));
});

secureApiRouter.delete('/jobs', async (req, res) => {
  const deleted = await DB.deleteJob(req.body);
  res.send(deleted);
});

secureApiRouter.delete('/jobs/shared', async (req, res) => {
  const deleted = await DB.deleteSharedJob(req.body);
  res.send(deleted);
});

app.use((_req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

const port = 4000;
const httpService = app.listen(port, function () {
  console.log(`Listening on port ${port}`);
});

let nextJobID;

function setAuthCookie(res, authToken) {
  res.cookie(authCookieName, authToken, {
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
  });
}

async function getLastJobID() {
  const highestJobID = await DB.getHighestJobID();
  nextJobID = highestJobID.jobID + 1;
}

getLastJobID();
peerProxy(httpService);



