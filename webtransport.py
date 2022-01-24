def create_web_transport_protocol(HandlerClass):
  import aioquic, aioquic.asyncio, aioquic.h3.connection

  class H3ConnectionWithDatagram(aioquic.h3.connection.H3Connection):
    def _validate_settings(self, settings): # override
      settings[aioquic.h3.connection.Setting.H3_DATAGRAM] = 1 # Enable HTTP Datagram
      return super()._validate_settings(settings)

    def _get_local_settings(self): # override
      settings = super()._get_local_settings()
      settings[0xffd277] = 1 # Enable HTTP Datagram: H3_DATAGRAM_05 from https://datatracker.ietf.org/doc/html/draft-ietf-masque-h3-datagram-05#section-9.1
      settings[0x08] = 1 # Enable extended CONNECT methods: ENABLE_CONNECT_PROTOCOL from https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-h3-websockets-00#section-5
      return settings

  class WebTransportProtocol(aioquic.asyncio.QuicConnectionProtocol):
    def quic_event_received(self, quic_event): # override
      if isinstance(quic_event, aioquic.quic.events.ProtocolNegotiated):
        self._http = H3ConnectionWithDatagram(self._quic, enable_webtransport=True)

      if self._http:
        # Send Quic events to client handler
        if self._handler:
          self._handler.quic_event_received(quic_event)

        # Send H3 events to client handler
        for h3_event in self._http.handle_event(quic_event):
          if isinstance(h3_event, aioquic.h3.events.HeadersReceived):
            if dict(h3_event.headers)[b":method"] == b"CONNECT" and dict(h3_event.headers)[b":protocol"] == b"webtransport":
              self._handler = HandlerClass(self, h3_event.stream_id, self._http)
              self._http.send_headers(stream_id=h3_event.stream_id, headers=[(b":status", b"200"), (b"sec-webtransport-http3-draft", b"draft02")])
            else:
              self._http.send_headers(stream_id=h3_event.stream_id, headers=[(b":status", b"400")], end_stream=True)

          if self._handler:
            self._handler.h3_event_received(h3_event)

  return WebTransportProtocol
