<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Storefront extends CI_Controller
{
    public function index()
    {
        require_once __DIR__ . '/../session.php';
        $access = storefrontAccess();
        $this->load->helper('url');
        $this->load->view('storefront', array_merge($access, array(
            'asset_base' => base_url('assets/'),
            'gate_home' => site_url('storefront'),
            'api_url' => base_url('api.php'),
        )));
    }
}
