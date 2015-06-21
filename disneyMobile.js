var Rides = new Mongo.Collection("rides");
var Parks = new Mongo.Collection("parks");

if (Meteor.isClient) {
  Meteor.subscribe("rides");
  Meteor.subscribe("parks");

  var SessionAmplify = _.extend({}, Session, {
    keys: _.object(_.map(amplify.store(), function(value, key) {
      return [key, JSON.stringify(value)]
    })),
    set: function (key, value) {
      Session.set.apply(this, arguments);
      amplify.store(key, value);
    },
  });

  Template.registerHelper('equals', function (a, b) {
    return a === b;
  });

  Template.registerHelper('lte', function (a, b) {
    return a <= b;
  });

  Template.body.helpers({
    currentPark: function() {
      return SessionAmplify.get("currentPark") || "DisneylandParis";
    },
    rides: function() {
      return Rides.find({}, {sort: {active: -1, waitTime: 1}});
    },
    parks: function()
    {
      return Parks.find({});
    }
  });

  Template.body.events({
    "click .park_tab": function(event) {
      var href = event.target.href.split("#")[1];
      SessionAmplify.set("currentPark", href);
    }
  });
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    // code to run on server at startup
  });

  var disneyMod = Meteor.npmRequire('wdwjs');
  var DisneyAPI = new disneyMod({
    timeFormat: "HH:mm"
  });

  var Fiber = Meteor.npmRequire('fibers');

  var parks = {
    DisneylandParis: {
      name: "DisneyPark",
      icon: "",
      getWaitTimes: Meteor.wrapAsync(DisneyAPI.DisneylandParis.GetWaitTimes),
      getSchedule: Meteor.wrapAsync(DisneyAPI.DisneylandParis.GetSchedule),
    },
    WaltDisneyStudios: {
      name: "Studios",
      getWaitTimes: Meteor.wrapAsync(DisneyAPI.WaltDisneyStudios.GetWaitTimes),
      getSchedule: Meteor.wrapAsync(DisneyAPI.WaltDisneyStudios.GetSchedule),
    }
  };

  // setup park collection
  for(var park in parks)
  {
    Parks.update(
      {park_id: park},
      {
        park_id: park,
        park_name: parks[park].name,
        park_icon: parks[park].icon
      },
      {upsert: true}
    );
  }

  Meteor.methods({
    GetRides: function()
    {
      var todo = [];
      for(var parkID in parks) todo.push(parkID);

      var step = function()
      {
        var park = todo.shift();
        if (!park)
        {
          return;
        }

        Fiber(function() {
          var data = parks[ park ].getWaitTimes();

          for(var i=0; i<data.length; i++)
          {

            var dataObj = {
              ride_id: data[i].id,
              name: data[i].name,
              waitTime: data[i].waitTime,
              active: data[i].active,
              park: park
            };

            for(var k in parks)
            {
              if (k == park) dataObj[ park ] = true;
            }

            Rides.update(
              {ride_id: data[i].id},
              { "$set": dataObj },
              {upsert: true}
            );
          }

          process.nextTick(step);
        }).run();
      };

      process.nextTick(step);
    }
  });

  function UpdateRides()
  {
    Meteor.call("GetRides");
  }

  // update rides every 30 seconds
  UpdateRides();
  Meteor.setInterval(UpdateRides, 1000 * 30);

  Meteor.publish("rides", function () {
    return Rides.find();
  });
  Meteor.publish("parks", function () {
    return Parks.find();
  });
}
