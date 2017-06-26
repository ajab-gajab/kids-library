/**
 * This file defines the routes for the login functionality
 * and all the routes are root path routes i.e.
 * will be accessed as http://<domain_name>/<route_name>
 */
var express = require('express');
var router = express.Router(),
    navLogUtil = require(process.cwd() + "/lib/navLogUtil.js"),
    navPasswordUtil = require(process.cwd() + "/lib/navPasswordUtil.js"),
    navResponseUtil = require(process.cwd() + "/lib/navResponseUtil.js"),
    navEmailVerification= require(process.cwd() + "/lib/navEmailVerification.js"),
    navnirmiteeApi = require(process.cwd() + "/lib/api.js"),
    navToysDAO = require(process.cwd() + "/lib/dao/toys/navToysDAO.js"),
    navValidationException = require(process.cwd() + "/lib/exceptions/navValidationException.js"),
    navUserNotException = require(process.cwd() + "/lib/exceptions/navUserNotFoundException.js"),
    navUserExistsException = require(process.cwd() + "/lib/exceptions/navUserExistsException.js"),
    navLogicalException = require("node-exceptions").LogicalException;
    navUserDAO = require(process.cwd() + "/lib/dao/user/userDAO.js"),
    passport = require('passport'),
    url = require("url"),
    Q = require('q'),
    moment = require('moment');



/**
 *  * used to verify email address of the user this route expects verification code as query parameter
 *   * If successfully verified it redirects user to second step of registration page
 *    */
router.get('/verify', function (req, res) {
    var code = req.query.id;
    var deferred = Q.defer();
    deferred.promise
        .done((user) => {
            res.render('registrationDetails',{
                layout : "nav_bar_layout",
                isLoggedIn : true,
                user : user[0],
                verificationCode : user[0].email_verification
            } );
        },(error) => {
            response = new navResponseUtil().generateErrorResponse(error);
            res.status(response.status).render("errorDocument",{
                errorResponse : response,
                user : req.user,
                isLoggedIn : false,
                layout : 'nav_bar_layout',
            });
        
        })
    req.assert("id","Id is Required").notEmpty();
    req.assert("id","Id not valid").isUUID();

    var validationErrors = req.validationErrors();
    var response;
    if(validationErrors)
    {
        return deferred.reject(new navLogicalException());
    }
    (new navUserDAO()).getUserDetailsByCode(code)
    .done(function (userDetails) {
        if (userDetails != 0) {
            return deferred.resolve(userDetails);
            res.render('registrationDetails',{
                layout : "nav_bar_layout",
                isLoggedIn : true,
                user : userDetails[0],
                verificationCode : userDetails[0].email_verification
            } );
        } else {
            return deferred.reject(new navLogicalException());
        }
    })
});

router.post("/registrationDetails", function(req,res) {
    var body = req.body;
    var loginEmailId = body.email,
        firstName = body.firstName,
        lastName = body.lastName,
        address = body.shippingAddress,
        verificationCode = req.query.code;
    var userDAO = new navUserDAO(),
        client, user;

    var deferred = Q.defer();
    deferred.promise
        .done(() => {
             res.redirect("/login");
        },(error) => {
            response = new navResponseUtil().generateErrorResponse(error);
            res.status(response.status).render("errorDocument",{
                errorResponse : response,
                user : req.user,
                isLoggedIn : false,
                layout : 'nav_bar_layout',
            });
        
        })
    req.assert("email","Email is Required").notEmpty();
    req.assert("email","Valid Email is Required").isEmail();
    req.assert("firstName","First Name is Required").notEmpty();
    req.assert("lastName","First Name is Required").notEmpty();
    req.assert("shippingAddress","First Name is Required").notEmpty();
    req.assert("code","Code is Required").notEmpty();
    req.assert("code","Bad Request").isUUID();
   

    var validationErrors = req.validationErrors();
    var response;
    if(validationErrors)
    {
        return deferred.reject(new navValidationException(validationErrors));
    }
    userDAO.getClient()
        .then(function (_client) {
            userDAO.providedClient = _client;
            return userDAO.startTx();
        })
        .then(function () {
            return userDAO.getUserDetailsByCode(verificationCode);
        })
        //todo : uncomment once email verification done and comment above then
        .then(function (userDetails) {

            if(userDetails.length == 0) {
                return Q.reject(new navLogicalException());
            }
            if(userDetails[0].email_address != loginEmailId) {
                return Q.reject(new navLogicalException());
            }

            user = userDetails[0];
            if (user.email_verification == verificationCode) {
                return userDAO.clearVerificationCode(user._id)
            } else {
                return Q.reject(new navLogicalException());
            }
        })
        .then(function () {
            return userDAO.updateUserDetails(user._id, firstName, lastName, address);
        })
        .then(function () {
            return userDAO.commitTx();
        })
        .catch(
        function (error) {
            //logg error
            navLogUtil.instance().log.call(self,'[/registerDetails]', 'Error while doing registration step 2' + error, "error");
            userDAO.rollBackTx()
                .then(function () {
                    return Q.reject(new Error());
                    //res.status(500).send("Internal Server Error");
                })
                .catch(function (error) {
                    //log error
                    return Q.reject(error)
                })
        })
        .finally(function () {
            if (userDAO.providedClient) {
                userDAO.providedClient.release();
                userDAO.providedClient = undefined;
            }
        })
        .done(() => {
            return deferred.resolve();

            //res.redirect("/login");
        },(error) => {
            return deferred.reject(error);
        });
})

module.exports = router;
