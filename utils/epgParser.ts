import { EPGData, EPGProgram } from '../types';

// Helper to parse XMLTV dates: YYYYMMDDhhmmss +0000
const parseXmlTvDate = (dateStr: string): Date | null => {
  if (!dateStr || dateStr.length < 14) return null;
  
  const y = parseInt(dateStr.substring(0, 4));
  const m = parseInt(dateStr.substring(4, 6)) - 1;
  const d = parseInt(dateStr.substring(6, 8));
  const h = parseInt(dateStr.substring(8, 10));
  const min = parseInt(dateStr.substring(10, 12));
  const s = parseInt(dateStr.substring(12, 14));
  
  // Basic date object (local time implies logic, usually EPG is UTC or offset provided)
  // Dealing with timezone offsets in XMLTV is complex, assuming local or UTC for simplicity in this demo
  return new Date(y, m, d, h, min, s);
};

export const fetchAndParseEPG = async (url: string): Promise<EPGData> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch EPG');
    const text = await response.text();
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    
    const programmes = xmlDoc.getElementsByTagName('programme');
    const epgData: EPGData = {};
    
    const now = new Date();
    // Optimization: Only keep programs from yesterday to tomorrow to save memory
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 2);

    for (let i = 0; i < programmes.length; i++) {
      const prog = programmes[i];
      const startStr = prog.getAttribute('start');
      const stopStr = prog.getAttribute('stop');
      const channelId = prog.getAttribute('channel');
      
      if (!startStr || !stopStr || !channelId) continue;
      
      const start = parseXmlTvDate(startStr);
      const end = parseXmlTvDate(stopStr);
      
      if (!start || !end) continue;
      
      // Filter out old/too far future events
      if (end < yesterday || start > tomorrow) continue;

      const titleNode = prog.getElementsByTagName('title')[0];
      const descNode = prog.getElementsByTagName('desc')[0];
      
      const title = titleNode ? titleNode.textContent || '' : 'Sem Título';
      const description = descNode ? descNode.textContent || '' : '';

      if (!epgData[channelId]) {
        epgData[channelId] = [];
      }
      
      epgData[channelId].push({
        start,
        end,
        title,
        description,
        channelId
      });
    }
    
    // Sort programs by time
    Object.keys(epgData).forEach(key => {
        epgData[key].sort((a, b) => a.start.getTime() - b.start.getTime());
    });

    return epgData;
  } catch (error) {
    console.error("Error parsing EPG:", error);
    return {};
  }
};