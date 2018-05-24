'use strict';

const React = require('react');
const ReactDOM = require('react-dom');
const rfetch = require('fetch-retry');
const Promise = require('bluebird');

require('../scss/layout.scss');

const create = require('create-react-class');

const urllib = require('url');
const blank = require('../assets/blank.jpg');
//const icons = require('./icons.js');

let options = {retries: 5, retryDelay: 200};

let App = create({
  displayName: "App",

  getInitialState: function() {
    let data = [null, null];
    if (localStorage.getItem("data") != undefined) {
      data = JSON.parse(localStorage.getItem("data"));
    }
    return({
      json: undefined,
      data: data
    });
  },

  getUserInfo: function(id, data) {
    let info = data[id];
    let url = urllib.format(Object.assign({}, info.hs, {
      pathname: `/_matrix/client/r0/profile/${info.login.user_id}/displayname`,
      query: {
        access_token: info.login.access_token
      }
    }));

    this.nameFetch = rfetch(url, options)
      .then(response => response.json())
      .then(responseJson => {
        info.display_name = info.login.user_id;
        if (responseJson.displayname != undefined) {
          info.display_name = responseJson.displayname;
        }
        let data = this.state.data;
        data[id] = info;
        this.setState({data: data});
      });

    url = urllib.format(Object.assign({}, info.hs, {
      pathname: `/_matrix/client/r0/profile/${info.login.user_id}/avatar_url`,
      query: {
        access_token: info.login.access_token
      }
    }));

    this.imgFetch = rfetch(url, options)
      .then(response => response.json())
      .then(responseJson => {
        info.img = blank;
        if(responseJson.errcode == undefined &&
          responseJson.avatar_url != undefined) {
          info.img = m_thumbnail(info.hs, responseJson.avatar_url, 256, 256);
        }
        let data = this.state.data;
        data[id] = info;
        this.setState({data: data});
        localStorage.setItem("data", JSON.stringify(data));
      });
  },

  getRoomlist: function(id, data) {
    let info = data[id];
    let localRooms = {};
    let url = urllib.format(Object.assign({}, info.hs, {
      pathname: "/_matrix/client/r0/joined_rooms",
      query: {
        access_token: info.login.access_token
      }
    }));

    rfetch(url, options)
      .then((response) => response.json())
      .catch((error) => {
        console.error('Error:', error);
      })
      .then((responseJson) => {
        Promise.map(responseJson.joined_rooms, (roomId) => {
          return this.getRoomInfo(info, roomId);
        }).then((roomInfoArray) => {
          roomInfoArray.forEach((roomInfo) => {
            localRooms[roomInfo[0]] = {
              name: roomInfo[1],
              img: roomInfo[2]
            };
          });

          let data = this.state.data;
          info.rooms = localRooms;
          data[id] = info;
          this.setState({data: data});
          localStorage.setItem("data", JSON.stringify(data));
        });
      });
  },

  getRoomInfo: function(info, roomId) {
    return Promise.all([
      roomId,
      this.getName(info, roomId),
      this.getPic(info, roomId)
    ]);
  },

  getName: function(info, roomId) {
    return new Promise((resolve, reject) => {
      let url = urllib.format(Object.assign({}, info.hs, {
        pathname: `/_matrix/client/r0/rooms/${roomId}/state/m.room.name`,
        query: {
          access_token: info.login.access_token
        }
      }));

      fetch(url)
        .then(response => response.json())
        .catch((error) => {
          console.error(error);
          reject(error);
        })
        .then(responseJson => {
          if (responseJson.name != undefined) {
            resolve(responseJson.name);
          } else {
            resolve(roomId);
          }
        });
    });
  },

  getPic: function(info, roomId) {
    return new Promise((resolve, reject) => {
      let url = urllib.format(Object.assign({}, info.hs, {
        pathname: `/_matrix/client/r0/rooms/${roomId}/state/m.room.avatar`,
        query: {
          access_token: info.login.access_token
        }
      }));

      fetch(url)
        .then(response => response.json())
        .catch((error) => {
          console.error(error);
          reject(error);
        })
        .then(responseJson => {
          if (responseJson.errcode == undefined) {
            resolve(m_download(info.hs, responseJson.url));
          } else {
            resolve(blank);
          }
        });
    });
  },

  login: function(id, data) {
    let hs = urllib.parse(data.hs);
    let url = urllib.format(Object.assign(hs, {
      pathname: "/_matrix/client/r0/login"
    }));

    let body = {
      "user": data.user,
      "password": data.pass,
      "type": "m.login.password",
      "initial_device_display_name": "Matrix Migration",
    };

    rfetch(url, {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json'
      },
      method: 'POST',
    }, options).then((response) => response.json())
      .then((responseJson) => {
        let data = this.state.data;
        data[id] = {};
        data[id].login = responseJson;
        data[id].hs = hs;
        this.setState({
          data: data
        });
        this.getUserInfo(id, data);
        this.getRoomlist(id, data);
      })
      .catch((error) => {
        this.setState({json: {error: error}});
        console.error(error);
      });
  },

  render: function() {
    return (
      <div className="container">
        <div className="split">
          <From id={0} login={this.login} data={this.state.data[0]}/>
        </div>

        <div className="split">
          <To id={1} login={this.login} data={this.state.data[1]}/>
        </div>
        <div className="migrate">
          Migrate
        </div>
      </div> 
    );
  }
});

let From = create({
  displayName: "From",

  render: function() {
    if (this.props.data != null) {
      let rooms = <span>Loading rooms</span>;
      if (this.props.data.rooms != undefined) {
        rooms = Object.keys(this.props.data.rooms).map((roomId) => {
          let room = this.props.data.rooms[roomId];
          return (
            <div className="row" key={roomId}>
              <img src={room.img}/>
              <span>{room.name}</span>
              <div className="checkbox">
                <input id={roomId} type="checkbox"/><label htmlFor={roomId}/>
              </div>
            </div>
          );
        });
      }
  
      return (
        <div className="profile">
          <div className="line">
            <h2>{this.props.data.display_name}</h2>
            <div className="checkbox">
              <input id="c1" type="checkbox"/><label htmlFor="c1"/>
            </div>
          </div>
          <div className="line">
            <img src={this.props.data.img}/>
            <div className="checkbox">
              <input id="c2" type="checkbox"/><label htmlFor="c2"/>
            </div>
          </div>
          <div className="table">
            {rooms}
          </div>
        </div>
      );
    }
    return (
      <LoginForm id={this.props.id} login={this.props.login}/>
    );
  }
});

let To = create({
  displayName: "To",

  render: function() {
    return (
      <div>
        <h2>{this.props.data.display_name}</h2>
        <img src={this.props.data.img}/>
      </div>
    );
  }
});

let LoginForm = create({
  displayName: "LoginForm",

  getInitialState: function() {
    return ({
      active: "",
      user: "",
      pass: "",
      hs: "https://matrix.org",
    });
  },

  handleUser: function(event) {
    this.setState({user: event.target.value});
  },

  handlePass: function(event) {
    this.setState({pass: event.target.value});
  },

  handleHs: function(event) {
    this.setState({hs: event.target.value});
  },

  submit: function() {
    this.setState({
      active: "active"
    });
    this.props.login(this.props.id, this.state);
  },

  render: function() {
    let active = this.state.active;
    return (
      <div className="input">
        <input className="noSubmit" value={this.state.user} onChange={this.handleUser} placeholder="Username"/><br/>
        <input className="noSubmit" value={this.state.pass} onChange={this.handlePass} placeholder="Password" type="password"/><br/>
        <input value={this.state.hs} onChange={this.handleHs} placeholder="Homeserver"/>
        <div className={"sk-cube-grid " + active} onClick={this.submit}>
          <span>Go</span>
          <div className="sk-cube sk-cube1"></div>
          <div className="sk-cube sk-cube2"></div>
          <div className="sk-cube sk-cube3"></div>
          <div className="sk-cube sk-cube4"></div>
          <div className="sk-cube sk-cube5"></div>
          <div className="sk-cube sk-cube6"></div>
          <div className="sk-cube sk-cube7"></div>
          <div className="sk-cube sk-cube8"></div>
          <div className="sk-cube sk-cube9"></div>
        </div>
      </div>
    );
  }
});

function m_thumbnail(hs, mxc, w, h) {
  return urllib.format(Object.assign({}, hs, {
    pathname: `/_matrix/media/r0/thumbnail/${mxc.substring(6)}`,
    query: {
      width: w,
      height: h
    }
  }));
}

function m_download(hs, mxc) {
  return urllib.format(Object.assign({}, hs, {
    pathname: `/_matrix/media/r0/download/${mxc.substring(6)}`
  }));
}

ReactDOM.render(
  <App />,
  document.getElementById('root')
);
