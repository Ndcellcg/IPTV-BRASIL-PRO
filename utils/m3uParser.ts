import { Channel, ParsedM3U } from '../types';

export const parseM3U = (content: string): ParsedM3U => {
  const lines = content.split('\n');
  const channels: Channel[] = [];
  let epgUrl: string | undefined;
  
  let currentChannel: Partial<Channel> = {};
  
  // Regex patterns
  const attrPattern = /([a-zA-Z0-9-]+)="([^"]*)"/g;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check Header for Global Attributes (like EPG URL)
    if (i === 0 && line.startsWith('#EXTM3U')) {
       // Try to find url-tvg or x-tvg-url
       const urlTvgMatch = line.match(/url-tvg="([^"]*)"/) || line.match(/x-tvg-url="([^"]*)"/);
       if (urlTvgMatch) {
         epgUrl = urlTvgMatch[1];
       }
    }
    
    if (line.startsWith('#EXTINF:')) {
      currentChannel = {}; // Reset for new channel
      
      // Extract attributes
      let match;
      while ((match = attrPattern.exec(line)) !== null) {
        const key = match[1].toLowerCase();
        const value = match[2];
        
        if (key === 'tvg-name') currentChannel.name = value;
        if (key === 'tvg-logo') currentChannel.logo = value;
        if (key === 'group-title') currentChannel.group = value;
        if (key === 'tvg-id') currentChannel.tvgId = value;
      }
      
      // Extract name from the end of the line (after the last comma)
      const nameMatch = line.match(/,([^,]*)$/);
      if (nameMatch && nameMatch[1]) {
        if (!currentChannel.name) {
          currentChannel.name = nameMatch[1].trim();
        }
      }
      
    } else if (line.startsWith('http') || line.startsWith('https') || line.startsWith('rtmp')) {
      // It's a URL line
      if (currentChannel) {
        // Create a unique ID
        const id = `ch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        channels.push({
          id,
          name: currentChannel.name || 'Canal Sem Nome',
          logo: currentChannel.logo,
          group: currentChannel.group || 'Geral',
          url: line,
          tvgId: currentChannel.tvgId
        });
        
        currentChannel = {}; // Reset
      }
    }
  }

  return { channels, epgUrl };
};