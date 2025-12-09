export interface Channel {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  url: string;
  tvgId?: string; // ID for mapping EPG
}

export interface Playlist {
  id: string;
  name: string;
  source: 'url' | 'file';
  url?: string; // Original URL if added via link
  epgUrl?: string; // URL for XMLTV data extracted from m3u header
  channels: Channel[];
  createdAt: number;
}

export interface ParsedM3U {
  channels: Channel[];
  epgUrl?: string;
}

export interface EPGProgram {
  start: Date;
  end: Date;
  title: string;
  description: string;
  channelId: string; // Matches tvg-id
}

export interface EPGData {
  [channelTvgId: string]: EPGProgram[];
}