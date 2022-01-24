#!/usr/bin/env python
import json, random, socket, asyncio, argparse
import aioquic, aioquic.asyncio, aioquic.h3.connection
import webtransport

# Gets the outbound LAN IP address
def get_ip():
  import socket
  s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
  s.settimeout(0)
  try:
    s.connect(('10.255.255.255', 1)) # does not have to be reachable
    IP = s.getsockname()[0]
  except Exception:
    IP = '127.0.0.1'
  finally:
    s.close()
  return IP

# This server operates as a general session-based echo server.
# Clients join an individual session ID each (a game instance/room),
# and within each managed session, all client messages are broadcast
# to all other clients who have joined the same session.
sessions = {}

def get_new_session_id():
  while True:
    id = random.randint(1000, 9999)
    if num_connections_in_session(id) == 0:
      return id

def num_connections_in_session(session_id):
  if not session_id in sessions:
    return 0
  session = sessions[session_id]
  count = 0
  for i in range(len(session)):
    if session[i] != None:
      count += 1
  return count

def assign_connection_to_session(session, connection):
  for i in range(2):
    if session[i] == None:
      session[i] = connection
      return i

def broadcast_peer_exited(session, connection_id):
  for i in range(len(session)):
    conn = session[i]
    if conn != None and i != connection_id:
      try:
        conn.send_json_datagram({'cmd': 'playerQuit', 'playerId': connection_id})
      except Exception:
        # We are sending a message to a client that has already disconnected
        session[i] = None


client_counter = 0

class CowboyHandler:
  def __init__(self, protocol, session_id, http):
    global client_counter
    self._protocol = protocol
    self.client_counter = client_counter
    client_counter += 1
    self._session_id = session_id
    self._http = http

  def send_json_datagram(self, data):
    self._http.send_datagram(self._session_id, json.dumps(data).encode('utf-8'))
    # Tell the aioquic library that it should now immediately initiate actual network
    # transfers for the data we want to send. Without this, there can be 5-10 seconds
    # long delays before the datagrams actually reach the network.
    # TODO: Should probably refactor to call .transmit() only after processing
    # a full batch of H3 messages that were received in one go, but would be good to
    # first get some kind of lower level profiling tool going to be able to examine
    # the effect.
    self._protocol.transmit()

  def h3_event_received(self, event):
    if isinstance(event, aioquic.h3.events.DatagramReceived):
      jsondata = json.loads(event.data.decode('utf-8'))
      # New player is joining a session?
      if 'cmd' in jsondata and jsondata['cmd'] == 'joinSession':
        session_id = int(jsondata['session']) if 'session' in jsondata and jsondata['session'] != None else get_new_session_id()

        # If the given session already has two players, assign the player to a new session.
        if num_connections_in_session(session_id) >= 2:
          session_id = get_new_session_id()
        if not session_id in sessions:
          sessions[session_id] = [None, None]
        self.current_session = sessions[session_id]
        new_player_id = assign_connection_to_session(self.current_session, self)

        print('Player joined session ' + str(session_id) + ' and was assigned player ID ' + str(new_player_id))

        # Tell all previous connections that a new client joined
        for i in range(len(self.current_session)):
          conn = self.current_session[i]
          if conn != None and conn != self:
            try:
              conn.send_json_datagram({'cmd': 'playerJoined', 'sessionId': session_id, 'playerId': new_player_id})
            except Exception as e:
              # We are sending a message to a client that has already disconnected
              self.current_session[i] = None

        self.send_json_datagram({'cmd': 'joinedSession', 'sessionId': session_id, 'playerId': new_player_id})
      else: # a regular non-join message
        # Broadcast the message to everyone in the same session
        for i in range(len(self.current_session)):
          conn = self.current_session[i]
          if conn != None and conn != self:
            try:
              conn.send_json_datagram(jsondata)
            except Exception as e:
              self.current_session[i] = None
              broadcast_peer_exited(self.current_session, i)

def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('certificate')
  parser.add_argument('key')
  args = parser.parse_args()
  ip = get_ip()
  port = 4433
  configuration = aioquic.quic.configuration.QuicConfiguration(alpn_protocols=aioquic.h3.connection.H3_ALPN, is_client=False, max_datagram_frame_size=65536)
  configuration.load_cert_chain(args.certificate, args.key)
  loop = asyncio.get_event_loop()
  loop.run_until_complete(aioquic.asyncio.serve(ip, port, configuration=configuration, create_protocol=webtransport.create_web_transport_protocol(CowboyHandler)))
  try:
    print("Listening for webtransport connections at https://{}:{}/".format(ip, port))
    loop.run_forever()
  except KeyboardInterrupt:
    pass

if __name__ == "__main__":
  main()
