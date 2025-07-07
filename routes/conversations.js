const express = require('express');
const router = express.Router();
const conversationManager = require('../config/conversations');

// Get all conversation sessions (for sidebar)
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await conversationManager.getAllSessions();
    res.json({
      success: true,
      sessions: sessions
    });
  } catch (error) {
    console.error('Error getting conversation sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load conversation sessions'
    });
  }
});

// Get current conversation session
router.get('/current', async (req, res) => {
  try {
    const session = await conversationManager.getCurrentSession();
    res.json({
      success: true,
      session: session
    });
  } catch (error) {
    console.error('Error getting current session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load current conversation'
    });
  }
});

// Get specific conversation by ID
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const conversations = await conversationManager.loadConversations();
    const session = conversations.sessions[sessionId];
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }
    
    res.json({
      success: true,
      session: session
    });
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load conversation'
    });
  }
});

// Create new conversation session
router.post('/new', async (req, res) => {
  try {
    const { title } = req.body;
    const sessionId = await conversationManager.createNewSession(title);
    const session = await conversationManager.getCurrentSession();
    
    res.json({
      success: true,
      sessionId: sessionId,
      session: session
    });
  } catch (error) {
    console.error('Error creating new conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create new conversation'
    });
  }
});

// Switch to a different conversation
router.post('/switch/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = await conversationManager.switchToSession(sessionId);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }
    
    const session = await conversationManager.getCurrentSession();
    res.json({
      success: true,
      sessionId: sessionId,
      session: session
    });
  } catch (error) {
    console.error('Error switching conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to switch conversation'
    });
  }
});

// Delete a conversation
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = await conversationManager.deleteSession(sessionId);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Conversation deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete conversation'
    });
  }
});

// Add message to conversation (called after AI responses)
router.post('/message', async (req, res) => {
  try {
    const { userMessage, aiResponse, sessionId } = req.body;
    
    if (!userMessage || !aiResponse) {
      return res.status(400).json({
        success: false,
        error: 'Both userMessage and aiResponse are required'
      });
    }
    
    const finalSessionId = await conversationManager.addMessage(userMessage, aiResponse, sessionId);
    
    res.json({
      success: true,
      sessionId: finalSessionId,
      message: 'Message added to conversation'
    });
  } catch (error) {
    console.error('Error adding message to conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save message to conversation'
    });
  }
});

// Get conversation context for AI (used by AI tools)
router.get('/context/:sessionId?', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 8 } = req.query;
    
    const context = await conversationManager.getContextForAI(sessionId, parseInt(limit));
    
    res.json({
      success: true,
      context: context
    });
  } catch (error) {
    console.error('Error getting conversation context:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get conversation context'
    });
  }
});

module.exports = router; 