var express = require('express')
var app = express()
var unirest = require('unirest');
var authentication_mdl = require('../middlewares/authentication');
var session_store;

// SHOW LIST OF QUESTIONS
app.get('/', authentication_mdl.is_login, function(req, res, next) {
	console.log("questions")
	req.getConnection(function(error, conn) {
		conn.query('SELECT * FROM questions where is_active = 1 ORDER BY id DESC',function(err, rows, fields) {
			if (err) {
				req.flash('error', err)
				res.render('index', {
					req: req
				})
			} else {		
				var query_str = 'https://api.dialogflow.com/v1/intents?v=20150910'
				unirest.get(query_str)
				.headers({'Authorization': 'Bearer ab71232a07a24e30a93a1f841d7b11d3', 'Content-Type': 'application/json'})
				.end(function (response) {
					var intent_res = response.body
					var all_intents = new Array();
					intent_res.forEach(function(value, key){
			    	all_intents.push({ 
			        id: intent_res[key]["id"], 
			        name: intent_res[key]["name"]
			    	}); 
					})
					var promise = new Promise(function (resolve, reject) {
          								var rowIds = []
                        	for(var i = 0; i < rows.length;i++){
                            rowIds.push(rows[i].id)
                      		}
                        	conn.query('SELECT * FROM sub_questions where question_id IN (?)', [rowIds], function(err, subrows) {
                          	resolve(subrows);
                        	});    
                    		});

          promise.then(function(subrows) {
            for(var k=0; k< rows.length; k++){
              rows[k]["sub_questions"] = []
              for (var i = 0; i < subrows.length; i++) {
                if (rows[k].id == subrows[i].question_id) {
                  rows[k]["sub_questions"].push(subrows[i].question + "_" +subrows[i].id)
                }
              }
            }
            res.render('questions/list', {
							intent_details: all_intents,
							req: req,
							data: rows
						});
          }, function(errorResponse) {
            console.log(test + ' No it failed');
      		});					
				});		
			}
		})
	})
})

// SHOW ADD QUESTION FORM
app.get('/add', authentication_mdl.is_login, function(req, res, next){	
	var query_str = 'https://api.dialogflow.com/v1/intents?v=20150910'
	unirest.get(query_str)
	.headers({'Authorization': 'Bearer ab71232a07a24e30a93a1f841d7b11d3', 'Content-Type': 'application/json'})
	.end(function (response) {
		var intent_res = response.body
		var all_intents = new Array();
		intent_res.forEach(function(value, key){
    	all_intents.push({ 
        id: intent_res[key]["id"], 
        name: intent_res[key]["name"]
    	}); 
		})
		res.render('questions/add', {
			intent_details: all_intents,
			req: req
		})
	});
})

app.post('/add_response', function(req, res) {
	var que_params = req.body
 	var intent_id = que_params['intent_id']
 	var res_obj = JSON.parse(que_params['res_obj'])
 	var query = que_params['response']
 	res_obj['responses'][0]['messages'].forEach(function(resp){
 		if (resp["speech"]){
 			if (Array.isArray(resp["speech"])) {
 				resp["speech"].push(query);	
 			} else {
 				var val = resp["speech"]
 				resp["speech"] = [val]
 				resp["speech"].push(query);	
 			} 			
 		}
 	});
 	delete res_obj["id"] 
	var query_str = 'https://api.dialogflow.com/v1/intents/' + intent_id + '?v=20150910'
	unirest.put(query_str)
	.headers({'Authorization': 'Bearer ab71232a07a24e30a93a1f841d7b11d3', 'Content-Type': 'application/json'})
	.send(res_obj)
	.end(function (response) {
		res.render('index', {title: 'My Training Module', req: req})
	});
})


// Here we are creating new intent and updating existing intent
app.post('/add/intent', function(req, res){	
	var params = JSON.stringify(req.body);
  var que_params = JSON.parse(params);
  var que_id = que_params['que_id']
  var que_intent = que_params['intent']
  var intent_id = que_params['intent_id']
	// Here we are creating new intent
  req.getConnection(function(error, conn) {
  	sql = 'select * from questions where id = ?'
		conn.query(sql, que_id,function(err, rows, fields) {
			var id = rows[0].id;
			var question = rows[0].question;
			var answer = rows[0].answer;	
			if (intent_id) {
				// Here we are updating existing intent
				unirest.get('https://api.dialogflow.com/v1/intents/'+ intent_id +'?v=20150910')
				.headers({'Authorization': 'Bearer ab71232a07a24e30a93a1f841d7b11d3', 'Content-Type': 'application/json'})
				.end(function (result){
				  var que_params = result.body
				  que_params['responses'][0]['messages'].forEach(function(resp){
				    if (resp["speech"]){
		          if (Array.isArray(resp["speech"])) {
		            resp["speech"].push(answer);    
		          } else {
		            var val = resp["speech"]
		            resp["speech"] = [val]
		            resp["speech"].push(answer);    
		          }                       
				    }
				  });
				  delete que_params["id"]
				  var user_says = {       
		        "count": 0,
		        "data": [
		        	{
		            "text": question
		          }
		        ],
		        "isTemplate": false,
		        "isAuto": false
					}
				  que_params['userSays'].push(user_says)
				  var query_str = 'https://api.dialogflow.com/v1/intents/' + intent_id + '?v=20150910'
				 	unirest.put(query_str)
				  .headers({'Authorization': 'Bearer ab71232a07a24e30a93a1f841d7b11d3','Content-Type': 'application/json'})
				  .send(que_params)
				  .end(function (response) {
				    conn.query('UPDATE questions SET intent = ?, intent_id = ?, is_active = ? WHERE id= ? ', [ que_intent, intent_id, 0, que_id ], function(err, user) {
							res.send(user);
						});
				  });
				});
			} else {
				conn.query('select * from sub_questions where question_id = ?', que_id, function(error,sub_queries,values){
					sub_que = [
										{
								  		"count": 0,
								  		"data": [
								    		{
								      			"text": question
								    		},
								    		{
								      			"userDefined": true
								    		}
								  		]
										}
									]
					sub_queries.forEach(function(k,v){
						sub_que.push({						
							"count": 0,
							"data": [
								{
									"text": sub_queries[v].question
								},
								{
									"userDefined": true
								}
							]
						});
					})
					var intent_data = 	{
						  									"contexts": [],
																"events": [],
																"fallbackIntent": false,
																"name": que_intent,
																"priority": 500000,
																"responses": [
																	{
															  		"defaultResponsePlatforms": {
															    		"google": true
															  		},
															  		"messages": [
															    		{
															      		"speech": answer,
															      		"type": 0
															    		}
															  		]
																	}
																],
																"userSays": sub_que,
																"webhookForSlotFilling": false,
																"webhookUsed": false
															}
					unirest.post('https://api.dialogflow.com/v1/intents?v=20150910')
					.headers({'Authorization': 'Bearer ab71232a07a24e30a93a1f841d7b11d3', 'Content-Type': 'application/json'})
					.send(intent_data)
					.end(function (response) {
						conn.query('UPDATE questions SET intent = ?, intent_id = ?, is_active =? WHERE id= ? ', [ que_intent, response.body['id'], 0, que_id ], function(err, user) {
							res.send(user);
						});
					});
				});					
			}
		})
	})
})



app.post('/add_question', function(req, res, next){	
	var post  = req.body;

	var sub_que = [];
  for(count=1; count<5; count++ )	{
		var t = "Question_" + count;
		var que = [post[t], post.question_id]
		sub_que.push(que);
	}

	req.getConnection(function(error, conn) {
		var sql = "INSERT INTO sub_questions (question, question_id)  VALUES ? "; 
		conn.query(sql,[sub_que], function(err, result) {
			if (err) {
				console.log("error")
			} else {
				console.log("t2 success")
			}
		});	
	});

	var context_que =[];
	for(a=0; a < (post.question.length) ; a++ )	{
		var question_id = post.question_id;
		var qry = post.question[a];
		var answer = post.answer[a];
		var action = post.actions[a];
		var final_que = [question_id, qry, answer, action, true]
		context_que.push(final_que)		
	}

	req.getConnection(function(error, conn) {
		var sql2 = "INSERT INTO context_questions (question_id, question, answer, action_name, is_active) VALUES ? ";
		conn.query(sql2,[context_que], function(err, result) {
			if (err) {
				console.log(error)
			} else {
				console.log("t3 success")
			}				
		});	
	});
	req.flash('success', "intent deatils addeed successfully")		
	res.redirect('/questions/add');		
});


// ADD NEW Question POST ACTION
app.post('/add', function(req, res, next){
	req.assert('question', 'Query is required').notEmpty()
	req.assert('answer', 'Response is required').notEmpty()
	var errors = req.validationErrors()
  if( !errors ) { 
  	let query_condition = ""
  	var que = req.body.question
  	var answer = req.body.answer
  	var intent = req.body.intent
 		unirest.post('https://api.dialogflow.com/v1/query?v=20150910')
		.headers({'Authorization': 'Bearer ab71232a07a24e30a93a1f841d7b11d3', 'Content-Type': 'application/json'})
		.send({ "lang": "en", "query": que, "sessionId": 1234 })
		.end(function (response) {
		 	var query_condition = response.body["result"]["action"]
		 	var in_id = response.body["result"]["metadata"]["intentId"]
		 	if(query_condition == "input.unknown"){
		 		if (intent) {
		 			var full_intent = intent.split('=')
		 			var question = {
						question: req.sanitize('question').escape().trim(),
						answer: req.sanitize('answer').escape().trim(),
						intent_id: full_intent[0],
						intent: full_intent[1],
						predefined_intent: true,
						is_active: true
					}
		 			req.getConnection(function(error, conn) {
						conn.query('INSERT INTO questions SET ?', question, function(err, result) {
							if (err) {
								req.flash('error', err)
								res.render('questions/add', {
									title: 'Add New Question',
									question: question.question,
									req : req,
									answer: question.answer
								})
							} else {				
								req.flash('success', "Data added successfully, wait for manager approval")
								res.redirect('/questions/add');		
							}
						})
					})					
				}else{
					var question = {
						question: req.sanitize('question').escape().trim(),
						answer: req.sanitize('answer').escape().trim(),
						is_active: true
					}
					req.getConnection(function(error, conn) {
						conn.query('INSERT INTO questions SET ?', question, function(err, result) {
							console.log(err)
							if (err) {
								req.flash('error', err)
								res.render('questions/add', {
									title: 'Add New Question',
									question: question.question,
									req : req,
									answer: question.answer
								})
							} else {				
								conn.query("select * from questions where id =?", result.insertId, function(err, result){
									req.flash('success', "Data added successfully")
									res.render('questions/add_question', {
										title: 'Add New Question',
										req: req,
										question: '',
										answer: '',
										q_id: result
									})							
								})
							}
						})
					})
				}
			} else {
				unirest.get('https://api.dialogflow.com/v1/intents/'+ in_id +'?v=20150910')
				.headers({'Authorization': 'Bearer ab71232a07a24e30a93a1f841d7b11d3', 'Content-Type': 'application/json'})
				.end(function (result){
					var res_obj = JSON.stringify(result.body);
					let res_hash = [];
					var res_int_id = result.body["id"]
					var res_int_name = result.body["name"]
					var res_array =  result.body["responses"][0]["messages"][0]["speech"]
					res_hash.push({
						que: que,
						intent: res_int_name,
						intent_id: res_int_id,
						res_array: res_array
					})
					req.flash('success', 'Data already existing in dialogflow')						
					res.render('questions/show', {
						title: 'Add New Question',
						question: res_hash,
						req: req,
						req_obj: res_obj,
						answer: ''
					})
				});
			}
		});  		
	}	else {  
		var error_msg = ''
		errors.forEach(function(error) {
			error_msg += error.msg + '<br>'
		})				
		req.flash('error', error_msg)		
		res.redirect('/questions/add');			
  }
})


app.post('/edit', function(req, res, next){	
	var post  = req.body;
	var que_id = post.que_id
	var main_que = post.question
	var sub_questions = post.sub_questions

	req.getConnection(function(error, conn) {
		var promise = new Promise(function (resolve, reject) {
                  	conn.query('UPDATE questions SET ? WHERE id = ?', [main_que, que_id], function(err, que_row) {
                  		if (err){
                  			console.log(err)
                  		} else {
                  			console.log("queries table updated successfully")
                  		}
                    	resolve(que_row);
                  	});    
                  });


		var promises = [];

		for (var i = 0; i < sub_questions.length; i++) 
		{
		  promises.push(update_subquery(sub_questions[i]));
		}

		function update_subquery(numb){
		 	return new Promise(function(resolve, reject){
		  	conn.query('UPDATE sub_questions SET question = ? WHERE id = ?', [numb.question, numb.id], function(err, subrows) {
	        if (err){
      			console.log("error")
      		} else {
      			console.log("sub query successfully updated")
      		}
      	});  
			});
		}

    promise.then(function(main_row) {    	
    	Promise.all(promises).then(function(subrows) {
      });
    })			
   	res.send("data successfully updated");		
	})
});

module.exports = app
