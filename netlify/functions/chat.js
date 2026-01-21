// Netlify Function for secure DeepSeek API calls
const https = require('https');

// System prompt for English teaching
const SYSTEM_PROMPT = `你是专业的英语AI教师助手。用户只能用英文向你提问。你的任务是：

1. 提供详细、有帮助的英语学习内容（词汇、语法、写作、发音等）
2. 给出具体例句和使用场景
3. 提供完整的中文翻译
4. 鼓励和教育性的语气
5. 如果被问词汇含义，提供定义、用法和例句
6. 如果被问语法，清楚解释规则并举例
7. 如果被问写作，给出结构化指导
8. 回复要全面但简洁

请按以下格式回复：
[英文回复内容，包含详细解释和例句]

然后在最后添加：
<div class="translation">[对应的中文翻译]</div>

记住：用户只能用英文提问，你要用中英双语回答，帮助用户学好英语！重点突出实用性和教育价值。`;

exports.handler = async (event, context) => {
  console.log('=== Function Called ===');
  console.log('HTTP Method:', event.httpMethod);
  
  // 处理 OPTIONS 预检请求
  if (event.httpMethod === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  // 只允许POST请求
  if (event.httpMethod !== 'POST') {
    console.error('Invalid method:', event.httpMethod);
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: false,
        error: 'Method Not Allowed' 
      })
    };
  }

  try {
    console.log('Parsing request body...');
    
    // 解析请求体
    const { message } = JSON.parse(event.body);
    console.log('Received message:', message ? message.substring(0, 50) + '...' : 'empty');
    
    if (!message) {
      console.error('No message provided');
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          success: false,
          error: 'Message is required' 
        })
      };
    }

    // 从环境变量获取API密钥（安全！）
    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    if (!apiKey) {
      console.error('DEEPSEEK_API_KEY environment variable is not set');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          success: false,
          error: 'Server configuration error: API key not set. Please set DEEPSEEK_API_KEY in Netlify environment variables.'
        })
      };
    }

    console.log('API Key found, calling DeepSeek API...');
    
    // 调用DeepSeek API
    const deepseekResponse = await callDeepSeekAPI(apiKey, message);
    
    console.log('DeepSeek API call successful');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify(deepseekResponse)
    };

  } catch (error) {
    console.error('=== Function Error ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return {
      statusCode: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: false,
        error: 'DeepSeek API call failed',
        details: error.message 
      })
    };
  }
};

// 调用DeepSeek API的辅助函数
function callDeepSeekAPI(apiKey, userMessage) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage }
      ],
      max_tokens: 1200,
      temperature: 0.7,
      stream: false
    });

    const options = {
      hostname: 'api.deepseek.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'English-Learning-App/1.0'
      },
      timeout: 30000 // 30 秒超时
    };

    console.log('Making HTTPS request to DeepSeek...');

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('DeepSeek response status:', res.statusCode);
        
        try {
          if (res.statusCode !== 200) {
            console.error('DeepSeek API error:', res.statusCode, data);
            reject(new Error(`DeepSeek API returned status ${res.statusCode}: ${data}`));
            return;
          }
          
          const jsonData = JSON.parse(data);
          console.log('Successfully parsed DeepSeek response');
          
          if (!jsonData.choices || !jsonData.choices[0] || !jsonData.choices[0].message) {
            console.error('Invalid DeepSeek response format:', jsonData);
            reject(new Error('Invalid response format from DeepSeek API'));
            return;
          }
          
          const aiContent = jsonData.choices[0].message.content;
          console.log('AI content length:', aiContent.length);
          
          // 分离英文和中文翻译
          let englishPart = aiContent;
          let chinesePart = "中文翻译未能正确提取，请查看英文回复内容。";
          
          if (aiContent.includes('<div class="translation">')) {
            const parts = aiContent.split('<div class="translation">');
            englishPart = parts[0].trim();
            chinesePart = parts[1].replace('</div>', '').trim();
            console.log('Translation extracted successfully');
          } else {
            const lines = aiContent.split('\n');
            if (lines.length > 1) {
              englishPart = lines.slice(0, -1).join('\n').trim();
              chinesePart = lines[lines.length - 1].trim();
              console.log('Translation extracted from last line');
            }
          }
          
          resolve({
            text: englishPart,
            translation: chinesePart,
            success: true
          });
          
        } catch (parseError) {
          console.error('Failed to parse DeepSeek response:', parseError);
          reject(new Error(`Failed to parse DeepSeek response: ${parseError.message}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('HTTPS request error:', error);
      reject(new Error(`HTTP request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      console.error('Request timeout');
      req.destroy();
      reject(new Error('Request timeout - DeepSeek API did not respond in time'));
    });

    console.log('Sending request to DeepSeek...');
    req.write(postData);
    req.end();
  });
}
