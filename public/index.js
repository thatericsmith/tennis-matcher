// client-side js
// run by the browser each time your view template is loaded
// by default, you've got jQuery,
// add other scripts at the bottom of index.html

var app = new Vue({
  el: '#app',
  data: {
    schedules: [
      { match_day: 'Monday' }
    ],
    players: [],
    addPlayerName: "",
    addPlayerPhone: "",
    currentPlayer: null,
    currentSchedule: null,
  },
  mounted: function() {
    $.get('/players', function(players) {
      app.players = players;
    });
    $.get('/schedules', function(schedules) {
      app.schedules = schedules;
    });
  },
  methods: {
    addPlayer: function() {
      const player = {
        name: this.addPlayerName,
        phone: this.addPlayerPhone
      };
      this.players.push(player);
      
      $.post('/players?' + $.param(player), function() {
        app.addPlayerName = "";
        app.addPlayerPhone = "";
      });
    },
    viewPlayer: function(player) {
      this.currentPlayer = player
      this.addPlayerName = player.name
      this.addPlayerPhone = player.phone
    },
    
    indexPlayer: function() {
      this.currentPlayer = null
    },
    
    addSchedule: function() {
      $.post('/schedules', function(schedule) {
        app.schedules.push(schedule)
      })
    },
    
    viewSchedule: function(schedule) {
      this.currentSchedule = schedule
    },
    
    indexSchedule: function() {
      this.currentSchedule = null
    }
  }
})