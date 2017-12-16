// server.js
// where your node app starts
var twilio = require('twilio');
var client = new twilio(process.env.TWILIO_ID, process.env.TWILIO_TOKEN);
var cronJob = require('cron').CronJob;
var moment = require('moment');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('.data/db.json');
const db = low(adapter);
// setup a new database
// persisted using sync file storage
// Security note: the database is saved to the file `db.json` on the local filesystem.
// It's deliberately placed in the `.data` directory which doesn't get copied if someone remixes the project.

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var MessagingResponse = require('twilio').twiml.MessagingResponse;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

const NOTIFY_DAY = 5;
const MATCHUP_DAY = 0;
const MATCH_DAY = 1;

// default player list
var defaultPlayers= [
      {"name":"Eric", "phone":process.env.MY_NUM},
      {"name":"Romeo",  "phone":"13103103100"},
      {"name":"Rob","phone":"15625625622"}
  ];
db.defaults({ players: defaultPlayers}).write();


var defaultSchedules= [
      {
        "notify_day": moment().day(NOTIFY_DAY), 
        "matchup_day": moment().day(MATCHUP_DAY),
        "match_day": moment().day(MATCH_DAY)
      }
  ];
db.defaults({ schedules: defaultSchedules}).write();

var textJob = new cronJob( '0 18 * * *', function(){
  //is it notify day?  yes: send notifications ask for rsvps
  //are there any maybe responses? yes: send those
  //is it matching day? yes: do the match, then send the matchups

  client.messages.create( { 
    to:outgoingPhone(process.env.MY_NUM), 
    from:outgoingPhone(process.env.TWILIO_NUMBER), 
    body:'Hello! Hope you’re having a good day!' 
  }, function( err, data ) {});

},  null, true, 'America/Los_Angeles');

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function(request, response) {
  response.sendFile(__dirname + '/views/index.html');
});

app.get("/players", function (request, response) {
  var dbUsers=[];
  var players = db.get('players').value() // Find all players in the collection
  players.forEach(function(player) {
    dbUsers.push({name:player.name}); // adds their info to the dbUsers value
  });
  response.send(dbUsers); // sends dbUsers back to the page
});

// creates a new entry in the players collection with the submitted values
app.post("/players", function (request, response) {
  db.get('players')
    .push({ name: request.query.name, phone: formatPhone(request.query.phone) })
    .write()
  console.log("New player inserted in the database");
  response.sendStatus(200);
});

app.get("/schedules", function (request, response) {
  var dbSchedules=[];
  var schedules = db.get('schedules').value() // Find all schedules in the collection
  schedules.forEach(function(schedule) {
    dbSchedules.push(schedule); // adds their info to the dbUsers value
  });
  response.send(dbSchedules); // sends dbUsers back to the page
});

app.post("/schedules", function (request, response) {
  const schedule = createSchedule();
  
  db.get('schedules')
    .push(schedule).write()
  console.log("New schedule inserted in the database");
  response.send(schedule);
});

// removes entries from db and populates it with default players
app.get("/reset", function (request, response) {
  // removes all entries from the collection
  db.get('players')
  .remove()
  .write()
  
  db.get('schedules')
  .remove()
  .write()
  console.log("Database cleared");
  
  // default players inserted in the database
  
  defaultPlayers.forEach(function(player){
    db.get('players')
      .push(player)
      .write()
  });
  console.log("Default players added");
  response.redirect("/");
});

function createSchedule() {
  let schedule = { 
        "notify_day": moment().day(NOTIFY_DAY), 
        "matchup_day": moment().day(MATCHUP_DAY),
        "match_day": moment().day(MATCH_DAY)
    };
  let canRsvp = 1;
  let dayExists = true;
  while(dayExists) {
    dayExists = db.get('schedules')
      .find({ notify_day: formatDate(schedule.notify_day)})
      .value();
    
    if (dayExists) {
      schedule.notify_day.add(1, 'week');
      schedule.matchup_day.add(1, 'week');
      schedule.match_day.add(1, 'week');
      canRsvp = 0;
    }
    
  }
 
  // Make sure Notify Day always comes first
  if (schedule.matchup_day.isBefore(schedule.notify_day)) {
    schedule.matchup_day.add(1, 'week');
  }
  if (schedule.match_day.isBefore(schedule.matchup_day)) {
    schedule.match_day.add(1, 'week');
  }
  
  for (var s in schedule) {
    schedule[s] = formatDate(schedule[s]);
  }
  
  
  // Add in Players
  schedule.players = [];
  var players = db.get('players').value() // Find all players in the collection
  players.forEach(function(player) {
    schedule.players.push({name:player.name, status:"-"}); 
  });
  
  // Is it active?
  schedule.can_rsvp = canRsvp
  
  return schedule;
}

function formatPhone(phone) {
  phone += "";
  if (phone == "" || phone === null) {
    return "";
  }
  
  return '1'+phone.replace('+','').replace('.','').replace('(','').replace(')','').replace('-','').replace(' ','').trim();
}

function incomingPhone(phone) {
  return phone.replace('+', '');
}
function outgoingPhone(phone) {
  return '+'+phone;
}

function formatDate(date) {
  return moment(date).format("dddd, MMMM D");
}

function handleCron(){
  var day = moment().day();
  if (day == NOTIFY_DAY) {
    return "Notify!";
  } else if (day == MATCHUP_DAY) {
    return "do matchups!";
  } else if (day == MATCH_DAY) {
    return "today is match day";
  }
  
  if (day > MATCH_DAY) {
    return "next match day is "+ moment().day(MATCH_DAY+7).format("dddd M/D");
  }
  
  return "today is day "+day;  
}

function updatePlayerStatus(schedule, player, status) {
  let dbSchedule = db.get('schedules')
                    .find({ match_day: schedule.match_day }).value();
  
  let players = dbSchedule.players;
  let foundPlayer = false;
  for (let p in players) {
    if (players[p].name == player.name) {
      players[p].status = status;
      foundPlayer = true;
      break;
    }
  }
  if (!foundPlayer) {
    player.status = status;
    players.push(player);
  }
  
  db.get('schedules')
    .find({ match_day: schedule.match_day })
    .assign({ players: players})
    .write()
}



app.get('/day', function (req, res) {
  res.send(handleCron());
});

app.get('/send', function (req, res) {
  var player = db.get('players')
    .find({ name: "Eric" })
    .value();
  if (typeof player === "undefined") {
    res.send("Could not find that player");
  }
  var schedule = db.get('schedules').find({can_rsvp: 1}).value();
  if (typeof schedule === "undefined") {
    res.send("No match is currently active");
  }

  client.messages.create( { 
    to:outgoingPhone(player.phone), 
    from:outgoingPhone(process.env.TWILIO_NUMBER), 
    body:'Hello! Can you play tennis on '+schedule.match_day+'? Reply with "Yes", "No", or "Maybe"' 
  }, function( err, data ) {});
  
  updatePlayerStatus(schedule, player, "sent")
  
  res.send("Sent!");
});

app.post('/message', function (req, res) {
  var resp = new MessagingResponse();
  var msg = req.body.Body.trim().toLowerCase();
  msg = msg.replace('"', '');
  var fromNum = incomingPhone(req.body.From);
  var player = db.get('players')
    .find({ phone: fromNum })
    .value();
  var schedule = db.get('schedules').find({can_rsvp: 1}).value();
  
  if(typeof player === "undefined") {
    resp.message('Sorry we don\'t seem to have your number');
  } else if(typeof schedule === "undefined") {
    resp.message('Sorry we don\'t seem to have any current matches available for RSVP');
  } else if( msg === 'yes' || msg === 'y' || msg === 'sure' || msg === 'yep' ) {
    updatePlayerStatus(schedule, player, "yes");
    resp.message('Thanks ' + player.name + '! We put you down for '+schedule.match_day+'!');
  } else if( msg === 'no' || msg === 'n' || msg === 'nah' || msg === 'nope' ) {
    updatePlayerStatus(schedule, player, "no");
    resp.message('Bummer ' + player.name + ' - we will miss ya on '+schedule.match_day+'!');
  } else if( msg === 'maybe' || msg === 'm' ) {
    updatePlayerStatus(schedule, player, "maybe");
    resp.message('Understood ' + player.name + '! Shoot us a "Yes" or "No" once you know for sure.');
  } else {
    resp.message('Send us a "Yes", "No" or "Maybe"');
  }

  res.writeHead(200, {
    'Content-Type':'text/xml'
  });
  res.end(resp.toString());

});

// listen for requests :)
var listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});